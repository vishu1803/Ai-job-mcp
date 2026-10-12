# PRD-003 - Structured resume field and date preservation

Status: COMPLETE locally (original repair2026-10-10; completeness follow-up verified2026-10-12). Dependency PRD-001 is locally complete. The user selected PRD-003 before the broader PRD-002 writing repair. Current phase remains P0 acceptance; production remains **NO-GO**.

## Pre-edit reproduction and root causes

Before production edits, tests/unit/prd003-resume-completeness.test.js reproduced eight failures, zero passes/skips/cancellations, under Node22 and an isolated blank-provider ENV_FILE. Evidence: OS Temp career-product-audit-run-lZsqu8/prd003-baseline.log.

| Boundary                     | Reproduced cause                                                                                                                      | Repair                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Profile/source to education  | Projection omitted current enrollment, location, honors and GPA aliases; EducationNormalizer dropped IDs and object metadata.         | Shared full source normalization, compatible aliases and complete object preservation.                             |
| Certification to document    | Profile used issuer/expiryDate; document expected issuingOrganization/expirationDate. Name-only rendering discarded details.          | Canonical record retains issuer, dates, ID, URL and notes; aliases remain compatible.                              |
| Optional sections to package | Builder assigned empty optionalSections; normal ordering excluded populated sections.                                                 | Nine validated arrays, protected composition and populated-section ordering.                                       |
| Uploaded source promotion    | Promotion overwrote education/work dates with null; optional sections had no typed mapping.                                           | Preserve parsed records, labeled credential metadata and typed OTHER sections; validate before approval/promotion. |
| Validation and optimizer     | Permissive dates; optional/source metadata absent from semantic fingerprint.                                                          | Calendar/chronology validation and full source semantic fingerprint.                                               |
| Actual document/download     | Chrome emitted empty itemize bullet and stripped literal braces/backslashes. Unicode filename caused actual HTTP500 ERR_INVALID_CHAR. | Remove empty preamble; protect escaped literals; ASCII header plus RFC5987 authentic filename.                     |

AI output is advisory. Deterministic server projections caused the reproduced section losses; no live-provider loss is asserted. Candidate-authored summaries are now retained and a truly empty profile has an empty summary. This narrow prerequisite does not close the broader PRD-002 writing audit.

## Canonical model and meaningful support

Generated documents remain StructuredResumeDocumentSchema version2.0.0. New fields are additive within JSONB; legacy2.0.0 records missing optional arrays remain readable. Platform identity/ownership, target role and document identifiers retain existing requirements. Missing career facts are valid.

| Section                | Canonical fields                                                                                                   | Empty/required behavior and support                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact/headline/links | Existing candidateIdentity name, headline, email, location, links and master metadata                              | Existing identity contract; no fabricated contact details. Profile/package/TeX/PDF; Unicode name/download exercised.                        |
| Summary                | Candidate text and existing evidence-aware metadata                                                                | Empty permitted; supplied wording retained in package/preview/TeX/PDF.                                                                      |
| Work                   | ID, title, company, start/end, current, location, employmentType, technologies, bullets, rawDateRange              | Meaningful partial records retained; no fake company/title. Save/read/edit/package/preview/TeX/PDF.                                         |
| Education              | ID, institution, degree, fieldOfStudy, dates/current, location, grade, coursework, honors, bullets, rawDateRange   | No default degree/institution. Multiple entries and full metadata survive save/read/edit/render.                                            |
| Credentials/licenses   | ID, name, issuingOrganization, issueDate, expirationDate, credentialId, credentialUrl, notes                       | Partial records valid. Legacy issuer/expiryDate/date/title supported. Full package/preview/TeX/PDF.                                         |
| Projects               | Existing ID/name/display name, technologies, repository/live links, evidence-linked bullets and selection metadata | Existing source eligibility/selection retained. Grounding regressions pass; arbitrary uploaded project reconstruction is not repaired here. |
| Technical skills       | Existing evidence-aware categories/items                                                                           | Existing claim/proficiency gates retained; no invented proficiency.                                                                         |
| Nontechnical skills    | optionalSections.additionalSkills                                                                                  | Source entry retained through profile/JSONB/package/preview/TeX/PDF.                                                                        |
| Publications/research  | publications: title/name, authors, publisher, date, description, URL                                               | Optional metadata may be missing. Same complete path; long URL/special symbols inspected.                                                   |
| Awards/achievements    | Separate arrays: title/name, issuer/organization, date, description/items                                          | No conflation or fake bullets. Same complete path.                                                                                          |
| Volunteer/leadership   | volunteerExperience/leadership: title, organization, dates/current, location, description/bullets/URL              | Partial source records valid. Same complete path.                                                                                           |
| Languages              | language/name, optional proficiency enum                                                                           | No Native/Fluent default. Same complete path.                                                                                               |
| Coursework/custom      | coursework/customSections: title/name/category, description, items/bullets and metadata                            | Explicit Markdown custom headings on text upload. Same complete path; unknown legacy metadata retained with warnings.                       |

Optional entries share a strict bounded schema: title/name500 characters, description/summary5000, list text2000, lists100 entries. Remaining bounds are explicit in resume-source-fields.js and source snapshot schemas. Invalid structure/date/URL/enum or overlong known fields fail validation. Credential URL retains the existing URL schema; generic optional URLs require HTTP/HTTPS. No arbitrary scheme/browser compatibility promise.

## Normalization and compatibility contract

- resume-source-normalizer.js owns canonical work, education, credentials and optional sections. Precedence: userCustom, profile metadata, direct profile, metadata.resumeData, direct resumeData. Property presence matters: explicit null/empty arrays clear stale sections; absent fields preserve fallback data.
- Resume dates are JSON strings: YYYY, YYYY-MM or YYYY-MM-DD. Calendar and precision-aware chronology validation rejects invalid/reversed ranges. Known month-name/month-year input normalizes without invented days; current markers survive. Seasonal/unknown date wording fails for review while the original upload remains available. PRD-001 analysis instants retain their separate UTC ISO contract.
- List order is preserved. Existing IDs survive edits; missing IDs receive deterministic content IDs independent of JSONB key ordering. Exact duplicate content and blank bullets are omitted; conflicting same-ID records fail. Repeated institutions/employers alone do not merge distinct records.
- Legacy school/major/GPA, role/employer/highlights and issuer/expiryDate normalize compatibly. Mixed string/object education keeps full objects. Conflicting aliases and unknown metadata remain in legacyFields with sourceWarnings; unsupported unknown-only records fail for review. No destructive rewrite/global stringify.
- Source remains USER_PROVIDED/CLAIMED; uploads remain CLAIMED. Structural validation never promotes VERIFIED. ISSUE-06 evidence eligibility, narrative trust, artifact seals, tenant/candidate guards and exact approved-package identity remain enforced.
- Advisory malformed model JSON, missing arrays, null and invented credentials cannot replace authoritative source arrays. Protected composition and semantic fingerprints include identity/source/optional data. Controlled model fixtures prove this server boundary, not live-AI writing quality.
- **No database migration required:** existing profile JSONB and source section structuredData/OTHER records hold the additive fields. Existing22 migrations apply fresh and rerun without destructive rewrites. Old sealed packages are unchanged; profile editing affects future generation without rewriting prior approval hashes.

## Verification and replay

Use Node22, --import ./tests/setup/approval-signing-env.js, an explicit isolated ENV_FILE from the product harness, blank provider credentials, local Chrome and a new disposable loopback product_audit_* PostgreSQL17 database. Never use development/staging/production data.

Final source gate: **136tests/136PASS/0FAIL/0CANCEL/0SKIP**,11 files:

```text
tests/unit/prd003-resume-completeness.test.js
tests/product/resume-functional-audit.test.js
tests/integration/prd003-resume-pipeline.test.js
tests/integration/source-resume-ingestion.test.js
tests/integration/candidate-profile.service.test.js
tests/unit/education-normalizer.test.js
tests/unit/date-range-normalizer.test.js
tests/unit/latex-document-generator.test.js
tests/unit/p16-structured-resume-contract.test.js
tests/unit/resume-parser.service.test.js
tests/unit/canonical-ats-parser.test.js
```

Run node --import ./tests/setup/approval-signing-env.js --test --test-concurrency=1 --test-timeout=300000 with those paths. The separate14-file integrity gate combines PRD-001's eight files with narrative-trust-boundary, p16-001g-professional-resume-composition, resume-entity-resolver, p56-resume-grounding-correctness, p16-008-content-optimizer and career-profile.schemas unit tests: **319PASS/0FAIL/0CANCEL/0SKIP**. Unique selected passing total455. Overlapping diagnostics are not added to acceptance totals.

Five new integration journeys use actual Fastify TCP HTTP, authenticated sessions/CSRF, PostgreSQL JSONB, encrypted storage and Chrome compilation:

1. Fresh owned candidate saves multiple education/credential/optional entries; repeated reload and profile HTML preserve fields.
2. Legitimate saved analysis reloads; prepare-handoff200/READY contains complete structured content, stable hash/version across package reloads, real Unicode PDF and bundle download. Foreign ownership fails.
3. Edit/save/reload regenerates real PDF and keeps IDs; previous package stays immutable. Invalid dates/malformed input fail; null clears a section.
4. Existing TXT upload parses, reviews/promotes full claimed records and optional sections; real PDF and byte-identical original download succeed.
5. Invalid uploaded dates fail approval before promotion; original stays available and unpromoted.

Additional real Chrome fixtures: student,20-role multipage, long metadata/URLs/symbols. Run tests/product/render-prd003-resume-fixtures.js with the emitted artifact directory, then tests/product/inspect-prd003-pdfs.py with PyMuPDF. Independently extract required metadata, all20 roles and literal braces/backslashes; check page bounds/replacement glyphs and inspect each raster PNG. This is corpus-specific content proof, not a validated ATS score.

Evidence in OS Temp career-prd003-20261010: final-source-gates.log, verified-integrity-gates.log, final integrity rerun log, pre-existing-baseline2.log and render/quality logs. Final artifacts: career-prd003-artifacts-9y7T2T. Test scaffolding initially used a nonexistent preload path; corrected to the existing setup path and reran the entire source gate. That harness failure is not product acceptance.

## Remaining limits and next work

DOCX export is NOT IMPLEMENTED (PRD-007). TXT upload is exercised end to end; existing PDF/DOCX parser defects remain PRD-004. Profile edit then regeneration is exercised; generated-resume editor remains PRD-010, NOT IMPLEMENTED. Native TeX execution, template redesign and all font/platform combinations are not verified. Existing roughly8.5pt body type and a role split across pages remain PRD-005 layout work despite retained content.

Legacy generic CareerArtifactExportService JSON Resume/Markdown adapters consume a separate old model. This repair proves canonical package, preview, PDF, TeX/bundle and original downloads; every legacy export adapter is not claimed canonical-field complete. Unknown legacy metadata remains explicitly warned rather than rendered as invented facts.

Older career-profile/Step1G/unsealed-artifact fixture failures reproduce on the pre-repair runtime and remain recorded, not bypassed. The dedicated additional-skills table/UI path retains its existing evidence contract; the new generic optional additionalSkills record path is not a claim that every legacy skills editor/export adapter is integration verified. Full repository green is not claimed. Live AI/GitHub, installed MV3, external ATS and release gates remain separate. No submission/deployment/new dependencies/broad security repair or completion-percentage claim.

Next recommendation: PRD-002 source-grounded writing, then parser/layout quality and editor acceptance under the existing roadmap.

## Structured completeness foundation follow-up (2026-10-12)

Status: COMPLETE locally — FIX VERIFIED LOCALLY. This follows the successful scoped GitHub synchronization; it does not recreate connectors, synchronize repositories or regenerate existing user applications. PRD-003 retains its existing identifier and additive 2.0.0 document contract. The earlier results above are historical verification, not counts for this follow-up.

### Reproduced losses and responsible boundaries

| Boundary | Failure reproduced before repair | Narrow repair |
| --- | --- | --- |
| Saved profile → identity | `userCustom.portfolioLinks` ignored; multiple links could be suppressed by platform. Saved headline lost to a stale/generated heading; null phone/location and cleared links could resurrect stale direct values. | Shared presence-aware source precedence; retain all distinct URLs; preserve authored master headline and explicit contact clears. Tailored header remains a target-specific presentation; canonical identity retains the authored master headline. |
| Work source → canonical | Valid summary/description remained unknown metadata rather than typed work fields and were omitted from documents. | Optional nullable bounded summary/description, source normalization, preview and renderer/export support. Absent fields stay absent for legacy serialization compatibility. |
| Project source → canonical/render | Explicit repository/live links were dropped; description was omitted; renderer independently capped already-selected bullets. | Preserve URLs/description and existing IDs; render all canonical selected bullets; include descriptions in optimizer semantic integrity. Do not change job ranking or project selection capacity. |
| Uploaded project → composition | A project with no ID selected `proj-1`, but composition indexed only IDs/names and could not resolve it. Actual PostgreSQL upload/reload/master generation produced zero projects. | Reconcile historical IDs first; only ID-less sources receive a deterministic scoped document ID based on their reconciliation key. No database project/resource row is created. Repeated reload resolves the same project. |
| Upload entity resolution | Canonical description concatenated all bullets and URL lines, duplicating accomplishments in the actual PDF. GitHub URL text also became an inferred project technology. Explicit source project IDs/descriptions were discarded. | Preserve explicit descriptions and IDs; do not manufacture an aggregate description. Strip URL tokens before project technology extraction while retaining original links/source sections. Candidate-authored technology references remain CLAIMED, not verified proficiency. |
| Empty saved summary | Explicit empty summary with a supplied work entry generated a generic engineering biography. | Keep null/blank authored summary empty. Explicit blank headline uses neutral Candidate Profile/Target role wording; no experience is invented to satisfy the required headline. Broader omitted-summary writing remains PRD-002. |
| Canonical → generic export | Strict canonical skills/summary/optional section shapes differed from legacy adapters. Work details, credentials and optional fields disappeared; adapters injected San Francisco/US/CA, 2020/Present and Author/Lead Developer defaults. | Validate a presentation projection only after existing ownership/current-narrative gates. Export complete meaningful metadata without fabricated defaults; canonical JSON preserves the original envelope. JSON Resume stores extra supported fields in `meta.antigravity.sourceSections`. |

Evidence: pre-edit `contact-headline-baseline.log` (2 failures), `project-id-baseline.log` (1 failure), `uploaded-render-baseline.log` (2 failures), `empty-profile-baseline.log`, `project-baseline.log`, `links-baseline.log`, and the original boundary characterization under OS Temp. The expanded HTTP test first exposed unresolved uploaded project IDs. An intermediate duplicate test accidentally appended a second identical existing bullet; its fixture was corrected rather than changing factual content. `.example.test` project URLs were rejected by the existing URL guard; fixtures now use syntactically supported `fixture.github.io` URLs without relaxing that guard.

### Canonical field support and pipeline map

The canonical field/date/provenance table above remains the section contract. Additional support is work `summary` (4000 characters) and `description` (8000), selected project `description` (8000), complete saved contact links, and authoritative headline/contact precedence. Email remains required and validated; missing email fails rather than inventing an address. Career sections remain optional; null/empty sections clear their existing source according to the shared precedence contract. Explicitly provided record IDs and list order survive normalization. Unknown legacy fields remain in `legacyFields` with review warnings; previously stored unknown-only metadata is not silently reinterpreted as a new credential or experience claim.

| Stage | Implementation / verified boundary |
| --- | --- |
| Profile input and reload | `/profile`, candidate profile service, profile JSONB; multiple degrees/credentials, all supported optional arrays, work text and multiple contact links survive actual HTTP save/reload/edit. |
| TXT parse/review/promotion | Resume parser → resume entity resolver → source ingestion → resume sections and profile `resumeData`; original encrypted upload remains downloadable byte-for-byte. Reviewed upload facts remain CLAIMED. Uploaded project links, technologies and a stable document identity survive reload. |
| GitHub-backed source selection | Candidate artifact content service retains existing repository/project identity and eligible evidence rules. Repository references/OBSERVED technology presence do not verify authorship/proficiency. No live GitHub data is changed. |
| Server model and AI | Strict StructuredResumeDocument schema, presence-aware normalizer, protected composition and optimizer semantic fingerprint. Advisory malformed/null/missing/fabricated model fixtures cannot replace authoritative education, credentials or optional arrays. Actual live model writing is not verified. |
| Package persistence | Existing package JSONB and analysis snapshot serialization; canonical hash remains stable across repeated reload. Profile edits generate future content without rewriting the original package/hash. Approval bindings and single-use execution remain intact. |
| Preview/PDF/TeX | Candidate preview and canonical TeX renderer preserve selected source facts. Supported real Chrome compilation and independent extraction/raster review exercise source metadata, international names, URLs and actual downloads. Native TeX compilation is not exercised. |
| Generic exports | Service-level canonical JSON, JSON Resume, Markdown and text adapters are validated. Existing legacy export integration is exercised. This does not introduce or claim a new public canonical-export endpoint. Standard JSON Resume fields cannot express credential expiry/IDs, education honors or custom sections; the documented extension retains them. |

No database migration or destructive rewrite is necessary: existing JSONB/source sections support the additive fields. Missing new work fields do not introduce null keys into legacy serialization. Previously stored `legacyFields.summary`/`description` are restored only as validated known fields when direct values are absent; explicit null wins, original metadata and saved IDs remain. Nontext values fail predictably without mutating input. Existing approved packages, source rows, ownership records and ingestion epochs are not rewritten. JSON exporter timestamps/default ATS values were removed from presentation metadata; security-critical package fields and canonical hash algorithms are unchanged.

### Document and quality verification

Six synthetic personas produce real PDF/TeX/JSON: student, experienced professional with20 employers, eight-project source profile, multiple degrees/credentials, incomplete profile, and long/Unicode content. The project selection policy selects four of eight source projects and records omissions; this repair does not promise every source project appears in a tailored document. No canonical selected bullet is subsequently clipped by the renderer. Project descriptions already present as exact bullets are rendered once.

Independent PyMuPDF checks compare expected source text and every canonical work/project bullet with extracted text, verify contact URL presentation and project hyperlink targets, detect replacement glyphs, inspect text span bounds, and rasterize all pages. Six persona PDFs contain eight pages; the three real HTTP journey PDFs add three pages. All required text/URLs, Unicode and literal TeX metacharacters survive these controlled cases. All11 pages receive visual review. This is genuine exported-content proof, not a mock compiler or a validated ATS score.

Objective acceptance: zero missing canonical required source strings; zero outside-page text spans; zero replacement glyphs; valid original URL targets; no empty synthetic achievement bullet; stable package hash; explicit invalid-data failure; no fabricated default dates/locations/roles. Professional hierarchy is present and chronology retains source order. Grammar, tense, action-verb strength, keyword relevance and concise summary recommendations remain heuristic writing guidance rather than proof of factual qualification or an ATS percentage.

Measured limits remain: minimum body text approximately8.5pt; Employer11 splits across pages; a short third page is underfilled; project title/link spacing is cramped. These are PRD-005 layout defects, not hidden as excellent design. Chrome profile header URLs are selectable display text without protocol/clickable annotations; TeX retains full targets. DOCX export is NOT IMPLEMENTED (PRD-007), PDF/DOCX ingestion correctness remains PRD-004, alternate template layouts remain unverified, and generated-resume editing remains PRD-010. Supported profile edit/regeneration is verified. Explicit absent career data is not an excuse to infer experience; broader legacy fallback prose still needs PRD-002.

### Existing development history and evidence

No configured development database or GitHub resource is mutated or reimported in this task. The supplied baseline10 resources/11 projects/135 skills/571 evidence/14 applications/602 packages is not independently recounted here. Tests use only a newly initialized loopback PostgreSQL17 database `product_audit_resume_foundation` on55443, isolated provider-blank ENV_FILE, synthetic tenants, actual Fastify HTTP and Chrome.

Read-only review of the reconnection report and current evidence selection/upsert implementation supports treating the three historical differences as extraction/revalidation metadata changes, not a demonstrated change to candidate source facts. Their original checkpoint retained hashes rather than full metadata; exact old metadata comparison remains NOT VERIFIED. No restoration/rewrite masks that limit, and OBSERVED repository facts do not become verified candidate achievements. Existing source freshness, receipt quarantine and approval requirements remain enforced.

### Follow-up gate evidence

Final unique selected gate: **643 tests /643 PASS /0 FAIL /0 CANCELLED /0 SKIPPED**. Unit gate:445 tests across22 files, including **26 new boundary regressions**. Integration gate:198 tests across11 files, including the five expanded real HTTP/PostgreSQL/Chrome journeys. Intermediate runs and before-edit failures are retained separately and are not summed into acceptance totals. The full repository suite, live AI, live GitHub/provider and external ATS integrations are not claimed green.

Unit selection (`tests/unit/<name>.test.js`): approval-signing-security; candidate-profile.service; career-artifact-export.service; narrative-trust-boundary; p16-001g-professional-resume-composition; p16-008-content-optimizer; p16-structured-resume-contract; p56-resume-grounding-correctness; prd001-analysis-serialization; prd003-resume-boundaries; prd003-resume-completeness; resume-entity-resolver; resume-entity-resolution-policy; resume-parser.service; latex-document-generator; education-normalizer; date-range-normalizer; canonical-ats-parser; extension-prepare-handoff-regression; application-package-identity; p16-001f3b-score-parity; career-profile.schemas.

Integration selection (`tests/integration/<name>.test.js`): evidence-verification-security; application-approval-content-binding; application-approval-execution; github-repository-reconnection; github-evidence-extractor; source-resume-ingestion; candidate-profile.service; career-artifact-export.service; p16-001f3b-analysis-snapshot; mcp-extension-unified-pipeline-parity; prd003-resume-pipeline. Use Node22 with `--import ./tests/setup/approval-signing-env.js --test --test-concurrency=1 --test-timeout=300000`, explicit isolated ENV_FILE, blank providers and a freshly migrated disposable database. GitHub fixtures are mocked; PostgreSQL and TCP HTTP/storage/rendering boundaries are real. No employer application is submitted by these tests.

Final evidence is in OS Temp `career-resume-foundation-20261011`: `unit-verified-final.log`, `integration-verified-final.log`, `render-current.log`, `pdf-final.log`, `http-pdf-verified-final.log`, `lint-final.log`, `secret-scan.log`, `db-lifecycle.log`, migration logs, and `documents/` (six persona PDFs/TeX/JSON, extracted text, page PNGs and inspection JSON). Final HTTP artifacts: OS Temp `career-prd003-artifacts-bXIxgB` (three PDFs, complete/uploaded canonical JSON/TeX and handoff ZIP). All11 raster pages were visually inspected; uploaded rendering was rechecked after the source-resolution repair.

Other gates:12 JavaScript syntax checks and Python syntax PASS; modified-source/docs Prettier and whitespace PASS; scoped strict secret scan17 files, zero findings; ESLint zero errors/14 warnings, the same14 reproduced on the three pre-change service files. Static database lifecycle audit PASS for116 integration files/101 DB users/zero violations. Fresh and repeat migration both PASS;22 applied migrations. Disposable database had zero tenants and zero other connections before stopping only the verified Temp cluster/port55443. Earlier sandbox init/library access and one automatic-review usage-limit interruption were resolved without bypassing approval or touching development data. No new dependencies or migration files.

Files changed in this follow-up:

- Runtime: `src/domain/career/{resume.schemas,resume-entity-resolver}.js`; `src/services/{source-resume-ingestion,candidate-artifact-content,career-artifact-export,latex-document-generator,structured-resume}.service.js`; `src/utils/{resume-source-normalizer,resume-export-view}.js`.
- Tests/inspection: `tests/unit/prd003-resume-boundaries.test.js` (new); `tests/integration/prd003-resume-pipeline.test.js`; `tests/product/{render-prd003-resume-fixtures.js,inspect-prd003-pdfs.py}`.
- Documentation: this report, `feature-repair-roadmap.md`, `resume-quality-audit.md`, and `project.md`. Earlier unrelated reconnection report/settings/staging script changes are preserved.

Acceptance: education, certifications, supported optional sections, selected project data, authoritative-source/model guard, actual PDF content, persistence round trip, PRD-001 serialization and selected ISSUE-02/06 integrity regressions **PASS**. These are supported local boundaries; outstanding writing/layout/parser/editor/DOCX/live gates remain explicit above. Next recommended repair: **PRD-002**. Production decision: **NO-GO**. No production deployment, existing user application generation/submission, GitHub import or approval consumption occurs.

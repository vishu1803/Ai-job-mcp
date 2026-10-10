# PRD-003 - Structured resume field and date preservation

Status: COMPLETE locally (2026-10-10). Dependency PRD-001 is locally complete. The user selected PRD-003 before the broader PRD-002 writing repair. Current phase remains P0 acceptance; production remains **NO-GO**.

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

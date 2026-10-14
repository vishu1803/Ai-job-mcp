# PRD-002 — Source-Grounded Writing and Strict One-Page Resume Repair

Date: 2026-10-14. Status: **FIX VERIFIED LOCALLY** for the supported factual-writing and strict Chrome ONE_PAGE boundaries. Current phase: P0 product acceptance. Production: **NO-GO**. Live AI writing quality and the user's next live application regeneration remain unverified.

## Original reproduction and root causes

The normal preparation path and BOTH regeneration both construct structured resume content, but the older writers had multiple summary strategies: domain biography templates, deterministic audit-style prose, candidate-authored summaries, and provider advisory output. The provider's unconstrained prose was already excluded by the narrative trust boundary; a successful provider call therefore did not mean its prose became the accepted resume. Test-mode generation also used deterministic composition. Regeneration's source filters were not the sole cause of poor output.

Reproduced causes:

- A generic domain catalog could describe qualifications absent from a sparse profile. Older fallback headings also made a target job look like an existing qualification.
- Audit-style summaries repeated project bullets, technology lists and repository-access disclaimers. Appropriate provenance metadata became unsuitable applicant-facing prose.
- A mandatory three-bullet project rule discarded legitimate projects with only one or two documented accomplishments, encouraging padding rather than preserving source capacity.
- Broad discovered technology inventories could read as candidate proficiency. Repository observations and missing-evidence gaps require different treatment from affirmative candidate claims.
- Chrome output defaulted to Letter with approximately 8.5pt body text; compilation did not establish exact page count, A4 geometry or a strict overflow failure.
- HTML preview, selected content and PDF input did not have one shared presentation contract. A renderer could prefer the full package's target-role headline over the selected, candidate-authored headline.
- Normal and BOTH score fallbacks included an invented 85. These specific fallbacks are removed; broader legacy ATS score UX is still a separate roadmap issue.

Controlled baseline: four identical synthetic source comparisons were generated from the earlier HEAD sources through an isolated read-only loader, without changing the checkout or database. All four baseline PDFs used Letter and minimum text approximately 8.4975pt. Three baseline receipts passed; the frontend-tailored baseline receipt failed. That failed-receipt PDF is a lower-level diagnostic example, never a trusted or approved application package. A separate earlier long-history baseline produced three pages.

## Canonical writing and evidence contract

`composeSourceGroundedSummary` is shared by accomplishment composition, AI-content normalization and the legacy tailoring route. A supplied summary remains verbatim with its source claim status; explicit blank/null clears stay empty. Otherwise the writer selects up to two renderable source sentences within a conservative word budget, ranking actual experience, source confidence and job relevance deterministically. Empty sources produce no experience biography and expose missing-data guidance.

There are no new employers, titles, dates, credentials, metrics or qualifications. Repository observations retain a repository/project subject and INFERRED provenance; they do not become personal authorship. Foreign candidate/tenant facts and missing/unknown evidence do not enter the summary. Source fact IDs, source text and transformation metadata remain authoritative. Arbitrary provider text or an echoed fact ID cannot authorize a new assertion.

Projects retain actual functionality, technologies and documented bullet text. One genuine bullet is valid; no three-bullet filler is generated. This is a source-grounded writing foundation, not a claim that sparse source material has become a persuasive biography. Existing candidate wording is preserved rather than silently rewritten for grammar or invented impact.

`writing` records `SOURCE_GROUNDED_DETERMINISTIC`, `providerUsed: false`, provider availability/advisory/failure and missing-data guidance. Provider failure diagnostics use private per-result state, not shared mutable status or extra fields inside authoritative narratives. Both normal preparation and BOTH regeneration use this same accepted writer. The live provider probe used only an isolated synthetic fact, not private candidate information: configured Vertex was attempted, returned `AI_PROVIDER_ERROR`, and no model response was accepted. **Live provider quality: NOT VERIFIED.**

## Strict ONE_PAGE contract and selection

An additive optional presentation contract is validated server-side and bound into the canonical package before hashing, sealing, persistence and human approval. Structured schema version remains 2.0.0. Legacy documents without this contract retain their existing view. No SQL migration or destructive data rewrite is needed.

The contract specifies ONE_PAGE, A4, minimum 10pt, renderer version, deterministic section order, exact omissions with reasons and source sentence indices for summary condensation. Complete accepted source fields remain in the snapshot. The pre-existing upstream selector still supplies at most four projects to this snapshot; additional profile projects remain saved in the profile. Do not confuse the full accepted snapshot with every project in the original profile.

Selection prioritizes identity/contact; supported summary; employment or student education/projects; supported skills; education; relevant credentials and additional sections. Latest employment is retained and original chronology within a section remains intact. Education and identity cannot be omitted by the presentation contract. Source sentence selection preserves technical names, decimals and abbreviations. Generated summaries that merely list source accomplishment bullets are omitted explicitly, avoiding a leftover lower-priority accomplishment presented as biography. Exact repeated content is omitted explicitly; duplicate claims across different legitimate employers are not assumed to be one historical record.

| Fitting pass | Projects (student) | Roles | Bullets per entry | Skills | Optional entries per section |
| ------------ | -----------------: | ----: | ----------------: | -----: | ---------------------------: |
| 0            |                  4 |     6 |                 4 |     24 |                            3 |
| 1            |                  3 |     4 |                 3 |     18 |                            2 |
| 2            |                  2 |     3 |                 2 |     12 |                            1 |
| 3            |                  1 |     2 |                 1 |      8 |                            0 |

Experienced candidates have a smaller project allowance, minimum one. Technology lists are bounded to six relevant source technologies. Affirmative skills admit supported VERIFIED/CORROBORATED and candidate CLAIMED/USER_PROVIDED categories; inferred repository associations and MISSING_EVIDENCE remain outside this skill presentation, with explicit reasons and retained underlying data. Relevant credentials are ranked without inventing credentials. The handoff preview discloses selection decisions using readable section labels.

The fitter renders at most four actual PDFs. Strict mode uses Chrome, fixed readable spacing and no native-engine fallback. It verifies physical page count with independent PDF geometry and Chrome leaf-page counts, requires consistent A4 dimensions, and fails closed for unknown or inconsistent output. If content still does not fit, export returns actionable ONE_PAGE_OVERFLOW/422 rather than two pages or an unreported removal. A 35-essential-education fixture failed after four bounded renders without persisting a partial package.

## PDF/TeX output verification

Chrome uses a single column, A4, 12mm vertical/14mm horizontal margins, 10pt body/contact text, 10.5pt headings and an 18pt name. Title/date rows preserve text extraction order; links are actual text annotations, not images. Unicode, TeX special characters, braces and angle symbols are escaped without erasing meaningful source text. Valid canonical HTTP/HTTPS source URLs survive rendering, including synthetic `.test` links; invalid source URLs fail predictably.

Independent PyMuPDF inspection verified all ten persona PDFs and four after-comparison PDFs: one physical A4 page each; minimum extracted font 9.9975pt (PDF numeric rounding of configured 10pt); all selected expected strings and links present; no detected outside-page or overlapping text spans, replacement glyphs or broken link annotations. Representative final pages were visually inspected: fresher, student, experienced, career changer, multiple credentials, project-heavy Unicode and long history. Successful compilation alone was not used as proof.

| Persona               | Physical pages | Explicit omission decisions | Result                                                                           |
| --------------------- | -------------: | --------------------------: | -------------------------------------------------------------------------------- |
| Empty profile         |              1 |                           0 | Neutral identity and guidance; no fake experience                                |
| Engineering fresher   |              1 |                           0 | Authored summary, education and genuine project bullets                          |
| Student with projects |              1 |                           1 | Education first; two projects; repeated summary omitted                          |
| Backend developer     |              1 |                           1 | Employment and relevant source facts                                             |
| Full-stack developer  |              1 |                           1 | Two projects and supported grouped skills                                        |
| Experienced developer |              1 |                           1 | Employment prioritized; repeated summary omitted                                 |
| Career changer        |              1 |                           1 | Actual operations title and responsibilities retained                            |
| Education/credentials |              1 |                           8 | Both degrees and three credentials shown; remaining source entries retained      |
| Project-heavy Unicode |              1 |                           3 | Two selected project presentations; original IDs/full selected snapshot retained |
| Long history          |              1 |                          10 | Six of fifteen source roles shown; all fifteen remain persisted                  |

Native TeX compilation was not performed in this gate. Real TeX documents were emitted and inspected for source escaping; actual PDF proof is Chrome only. These checks establish parseable text and local geometry, not employer ATS rankings, universal font coverage or an automated grammar certification.

## Before/after examples

Synthetic documents are available in `output/pdf/prd002/`. Full source/view JSON, text, PDFs, raster images and gate logs are also retained under OS Temp `career-prd002-20261014`. No private user resume is included.

| Same-source example | Before                                                                         | After                                                              | Concrete improvement                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresher             | [PDF](../../output/pdf/prd002/fresher-before.pdf)                              | [PDF](../../output/pdf/prd002/fresher-after.pdf)                   | Saved Computer Science Graduate headline retained instead of presenting Backend Developer as a qualification; education before projects; 10pt A4 and portfolio link retained |
| Experienced         | [PDF](../../output/pdf/prd002/experienced-before.pdf)                          | [PDF](../../output/pdf/prd002/experienced-after.pdf)               | Audit-style summary no longer repeats project claims or access disclaimers; employment first, real companies/dates unchanged                                                 |
| Project-heavy       | [PDF](../../output/pdf/prd002/project-heavy-before.pdf)                        | [PDF](../../output/pdf/prd002/project-heavy-after.pdf)             | Explicit duplicate presentation decisions, shorter relevant inventory, Unicode name and readable hierarchy                                                                   |
| Frontend-tailored   | [diagnostic PDF; receipt FAIL](../../output/pdf/prd002/jd-tailored-before.pdf) | [PDF; receipt PASS](../../output/pdf/prd002/jd-tailored-after.pdf) | Supported React/TypeScript interface facts selected without inventing job requirements as qualifications; source-authority receipt passes                                    |

Each example also has neighboring `.tex` and extracted `.txt` files. Before and after are synthetic controlled evidence, not a live-provider success claim.

## Persistence and application safety

Disposable PostgreSQL and real TCP HTTP exercised save/reload, edit, BOTH regeneration, preview/download, encrypted artifact storage, independent page count and fresh review eligibility. A fifteen-role source survives save/reload while its explicit six-role presentation fits one page; subsequent edits regenerate a separate version. Repeated/concurrent regeneration, package ownership, source eligibility, canonical hashes, quarantined/missing historical versions, approval bindings and consumed execution remain guarded.

The fitter runs before package sealing. Post-seal preview/export applies only the accepted decisions; it cannot quietly select different content or inherit an old approval. Old payloads, hashes, document IDs and approved snapshots remain immutable. Missing-evidence skill gaps remain separate. Current-package and artifact-receipt assertions are not bypassed.

No configured development database, GitHub resource, historical evidence or existing user application was read or changed by this repair. No submission, approval, deployment, repository import or connector recreation occurred. Baseline development counts were not independently refreshed and are not presented as measured current counts.

## Files changed and tests added

Runtime: `resume.schemas.js`; `source-grounded-summary.service.js` (new); `one-page-resume.service.js` (new); accomplishment composer, AI resume content generator, legacy tailoring, structured resume, content quality gate, job application workflow, TeX document generator, Chrome compiler, application handoff, web regeneration error handling and handoff view. Earlier application-regeneration repair edits remain preserved.

New deterministic coverage: 15 source-writing tests, 14 one-page selection tests, nine Chrome contract tests, five legacy tailoring tests and two real HTTP/PostgreSQL/Chrome regeneration tests: **45 added tests**. Ten-persona fixtures and four product render/inspection/probe scripts provide actual document evidence separately from unit mocks.

Existing tests were corrected where they demanded exactly three fabricated/padded bullets, obsolete generic biographies or arbitrary provider prose. Source authority, provenance, candidate ownership and exact narrative integrity assertions remain enforced. One unordered SELECT preservation assertion now compares complete skill rows sorted by stable ID. Disposable fixture guards authorize only the exact new cluster path/port/database, not arbitrary development databases.

## Test results and quality gates

| Final selected gate                                              |     PASS | FAIL remaining | CANCELLED | SKIPPED |
| ---------------------------------------------------------------- | -------: | -------------: | --------: | ------: |
| Unit, 30 files (`unit-verified-final.log`)                       |      733 |              0 |         0 |       0 |
| Handoff UI disclosure, one additional file (`ui-disclosure.log`) |        3 |              0 |         0 |       0 |
| PostgreSQL/HTTP integration, 14 unique files                     |      323 |              0 |         0 |       0 |
| **Nonoverlapping selected total**                                | **1059** |          **0** |     **0** |   **0** |

Integration count is a corrected aggregate, not one green command: the main run had 271 PASS/52 FAIL. Forty-nine failures were exact disposable fixture guard rejections; those 49 tests passed after correcting the exact allowlist. Three handoff failures arose in a heavy concurrent Chrome run; isolated per-render Chrome profiles were added and the complete 17-test file passed. Aggregate: 271 minus its earlier 14 passes, plus 49 corrected guard tests, plus 17 complete handoff tests = 323. The final two new HTTP journeys were rerun successfully after final source-authority changes and are not counted twice.

An unchanged-source baseline of five older writer files had 107 PASS/3 FAIL; obsolete capacity/provider expectations were reproduced before correction. A final selection test initially assumed the builder returned a project without supplied AI content; its explicit source fixture was corrected and all 14 selection tests passed. Intermediate writer failures also exposed serialized provider diagnostics changing authoritative narrative shape; private per-result diagnostics repaired production behavior without relaxing narrative equality assertions. A broad final unit rerun after test-database teardown produced one ECONNREFUSED in the SQL-backed privacy test; restarting only the disposable cluster and rerunning yielded 733/733 PASS. Initial PDF-module path, Windows loader URI and secret-scan manifest decoding errors were test harness issues and were corrected.

Selected security/compatibility regressions: PRD-001 canonical serialization; PRD-003 field preservation; ISSUE-02 immutable snapshots; ISSUE-03 at-most-once approval execution; ISSUE-06 source/provenance/narrative trust; missing/quarantined historical artifacts; GitHub installation ownership, resource reconciliation and large-tree synchronization: **PASS locally**. GitHub fixtures remain mocked remote responses; HTTP/SQL/Chrome/storage boundaries are real.

Quality gates: modified JavaScript syntax PASS; ESLint zero errors/29 warnings (not a repository-wide warning-clean claim); formatting and whitespace PASS; existing 22 fresh migrations applied and repeat migration succeeded; Drizzle migration checks PASS; lifecycle audit 117 integration files/102 database users/zero violations PASS. Strict scoped secret scanning of 40 modified JavaScript/documentation files found zero secrets. A mistakenly broad scanner invocation reported 68 existing potential pattern matches outside this scoped pass; those are not claimed resolved or all harmless. No new dependencies or database migration. Before teardown the isolated PostgreSQL cluster had zero tenants, 22 migration rows and zero other connections; only the verified Temp cluster on port 55445 was stopped successfully. Test evidence was retained.

Reproduction commands: Node 22 `--test` with the `unit-gate-files.txt` and `integration-gate-files.txt` manifests in the isolated Temp evidence directory; reruns `guarded-integration-rerun.log`, `handoff-final.log`, `final-http.log`. Use `ENV_FILE` pointing to the disposable audit fixture and NODE_ENV=test. Product scripts: `render-prd002-resume-fixtures.js <output>`, `render-prd002-comparison.js <output>`, and `inspect-prd002-pdfs.py <output>`. Never run fixture mutations against the user's development configuration.

## Remaining limitations and next action

- Live AI writing quality is unverified; accepted output is factual deterministic composition, not advertised as AI-written prose. Better provider paraphrasing requires a separately validated source-authority contract.
- Readability/content evidence covers the tested synthetic corpus; RTL, every language/font, every long URL and every employer ATS engine are not proven.
- Thin sources cannot yield impressive accomplishments without the candidate adding true facts. Empty profiles can produce a neutral document but are not application-ready candidates.
- One-page defaults make explicit deterministic selections; a full section-selection editor is still PRD-010. Full profile data remains available, including projects outside the existing upstream selector.
- Broader PRD-005 templates/native TeX, PRD-007 DOCX, PRD-004 parser correctness and PRD-009 legacy score UX remain open. This task does not complete all resume-product work.
- Live development verification requires the user to restart the updated server, explicitly regenerate BOTH for the intended application, inspect the new one-page PDF and selection disclosure, then separately review/approve the new version. No automatic regeneration occurred.

Next recommended dependency-ready repair: **PRD-004 — resume intake/parser correctness**.

PRD STATUS: FIX VERIFIED LOCALLY

SOURCE-GROUNDED WRITING: PASS

STRICT ONE_PAGE OUTPUT: PASS (supported Chrome boundary)

AI FABRICATION GUARD: PASS

REAL PDF CONTENT CHECK: PASS

PERSISTENCE ROUND TRIP: PASS

PRD-001 REGRESSION: PASS

PRD-003 REGRESSION: PASS

ISSUE-02 / ISSUE-03 / ISSUE-06 REGRESSIONS: PASS

NEW TESTS PASSING: 45

TOTAL TESTS PASSING: 1059

TOTAL TESTS FAILING: 0 remaining in the selected final gates

LIVE AI WRITING VERIFIED: NO

LIVE DEVELOPMENT REGENERATION REQUIRED: YES

PRODUCTION DECISION: NO-GO

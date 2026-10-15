# Resume quality correction — Milestone A

2026-10-15. **IN_PROGRESS: offline skill-loss correction verified; secure real-data source trace and personal after-PDF remain BLOCKED.**

Current findings and recovery actions: [runtime and skill-retention report](resume-quality-runtime-and-retention.md).
The normal port 3000 origin was initially absent while the tunnel was connected;
an external normal watch process appeared during final verification and both local
and public login now return 200. This task did not start it. No database
failure or connection-security readiness has been established. The structured composer missed explicit canonical
master skill assertions. Its local correction retains those assertions as CLAIMED,
with 67 focused tests passing and twelve independently inspected synthetic
before/after PDFs. An extended gate has one pre-existing Drizzle assertion failure
(79/80 passing); see the report for exact scope and remaining quality findings.
No Aiven connection or candidate regeneration occurred. The same existing database
and authenticated read services remain the plan, with credential-rotation
confirmation and verified TLS configuration required before database-backed reads.
Earlier separate-login/operator requirements below are historical, superseded
instructions; they are not current prerequisites.

Latest owner instruction: reuse existing authenticated application read services,
without a separate database user prerequisite. See the [current read-service and
runtime investigation](resume-quality-authenticated-read-map.md). No direct SQL is
currently justified or requested. Earlier direct-access prerequisites below are
historical and do not override this application-read-first approach.
The owner's real PDF is the acceptance sample. Synthetic document checks and the
earlier 592-test milestone do not establish its content quality. Milestone B is
not started. Work is in the consolidated main checkout, baseline ce03df2.

## Observed acceptance sample

The exact supplied file was located in Downloads after a permissions-limited
filename search was repeated with read access. Its original bytes, extracted text
and page raster are preserved in an owner-restricted OS temporary folder outside
Git. No personal details have been added to fixtures, snapshots or this report.

- PDF metadata identifies HeadlessChrome 155 and Skia/PDF m155. This is Chrome
  output, not a native TeX PDF. One physical page measures approximately
  594.96 by 841.92 points (A4 rounding); minimum extracted font size is 9.997pt,
  consistent with the configured 10pt and existing conversion tolerance.
- Technical Skills contains two names. Other technology names appear in the
  summary/project narrative. Their presence alone does not verify proficiency.
- Education precedes projects and skills; experience follows skills. This matches
  a possible FRESHER one-page presentation policy, but the exact saved
  `presentation` and tailoring plan have not yet been retrieved.
- Location and employment type are separate paragraphs; the employment enum is
  printed in uppercase. Education location is separated from its institution by
  coursework. Email and the first profile URL lack a separator.
- The file includes DSA and language sections and candidate-specific quantitative
  wording. Their source classification and relevance remain unverified pending
  the saved records. No metric was removed or independently verified by this task.

## Pipeline boundaries and findings

| Stage | Current evidence | Remaining proof |
| --- | --- | --- |
| Reviewed master/profile | Source ingestion stores reviewed canonical `resumeData`; Studio clones that snapshot | Exact sample master/version, claims and source skill rows |
| Target and ranking | Normal structured builder consumes candidate inventory, job matches and project rankings | Exact target JD and ranking/selection audit |
| Skills | `structured-resume.service.js` selects from inventory; `candidate-artifact-content.service.js` filters/categorizes; one-page view may omit entries | Which boundary reduced this sample to two skills; do not infer cause from PDF alone |
| Composition | Normal one-page policy has FRESHER education-first order; Studio projection hard-codes its own order | Confirm actual saved order and career-stage decision before changing policy |
| Rendering | Shared generator emits standalone metadata; Chrome flattened contact/profile paragraphs | Reproduced with synthetic records; formatting fixes implemented |
| Final output | Actual supplied PDF is Chrome/Skia | Match to exact immutable package and export inputs, then regenerate from authoritative source |

The main configured database is nonloopback. The prepared probe aborted **before
connecting**. Authorization was requested for a candidate/application-scoped
read-only transaction, with no migration/write and private local output.
An exported canonical master, matching application package and JD is an alternative.
No nonlocal database data has been accessed by this task.

## Historical conditional source-access preflight (superseded)

Earlier target clarification: the investigation would use the **same configured
Aiven database**, with a separate restricted login on that database. No new
database, fork, reset or candidate-data migration is proposed. For the current
operator steps, use [the same-database Aiven access guide](resume-quality-aiven-access.md).
Earlier conditional authorization is preserved below as history; actual database
classification still must not be inferred from local NODE_ENV. Missing login/CA
configuration and unconfirmed administrator rotation remain the immediate blockers.

The owner subsequently authorized only a narrowly scoped read-only investigation,
conditional on verified nonproduction environment, a restricted read-only role,
TLS certificate verification and confirmation that the previously exposed
administrator credential has been rotated or revoked.

Offline configuration/source inspection, without importing the application or
initializing a database client, produced these results:

| Required check | Result |
| --- | --- |
| Database environment | UNVERIFIED. Local application mode defaults to development; this does not identify the nonloopback database as development or staging. |
| Restricted read-only role | NOT CONFIRMED. Configured username is administrator-style; database role attributes/grants have not been queried. |
| TLS certificate verification | NOT ESTABLISHED. Current shared pool's nonproduction branch explicitly sets `rejectUnauthorized: false`, stripping URL SSL parameters first. TLS encryption being requested does not establish verified certificates. |
| Exposed administrator credential invalidated | UNCONFIRMED. No confirmation of administrator password rotation/revocation was found in the scoped project documentation. This is not evidence that rotation never occurred. |

Per the owner's STOP condition, no connection or record query was attempted.
Do not run the earlier prepared source probe under the new conditional approval.
No test login with an old administrator credential is authorized. No further
product code, configuration, regeneration or UI changes were made in this
follow-up; earlier formatting fixes remain intact.

Required owner/DB administrator assistance:

1. Identify the exact service/database environment in the provider control plane.
   Confirm **development or staging**. If production or still uncertain, do not
   supply direct access; provide a scoped owner-authorized export instead.
2. In the provider control plane, rotate/revoke the previously exposed administrator
   credential and update its legitimate consumers through the normal secret
   mechanism. Supply only confirmation and the rotation/revocation timestamp or
   audit-event reference; never send the password or connection string in chat.
3. For the confirmed nonproduction service, have its administrator provision a
   separate login with only the necessary SELECT privileges, no object ownership,
   administrative attributes, write/DDL grants or inherited write privileges.
   Restrict it to the approved candidate/application data; do not reuse the app's
   administrator connection. A read-only transaction alone does not restrict an
   administrator role.
4. Store this separate audit connection and the provider's trusted CA certificate
   in protected local files, outside committed content. Tell the agent only the
   file paths. Do not replace the main application environment. The dedicated
   audit client must enforce `rejectUnauthorized: true` and hostname/CA validation;
   do not change NODE_ENV merely to select a different SSL branch.
5. After these prerequisites, verify only role/TLS metadata first. Proceed to
   bounded, tenant/candidate/application-scoped SELECTs inside an explicit read-only
   transaction only after those checks pass. No personal records go to AI providers.

Export alternative: canonical master/version, reviewed profile, relevant skill and
evidence classifications/citations, exact job description, matching package and
selection/presentation audit. Exclude passwords, cookies, sessions, OAuth/provider
credentials and unrelated users; store privately and supply only its local path.
Work can then continue using the already authorized isolated database without
direct source-database access.

## Implemented narrow correction

The shared LaTeX generator now keeps location and readable employment type in one
metadata paragraph and education location alongside its institution. Studio's
native DOCX blocks and expected-text projection use the same wording. Source
records and provenance are unchanged. Unknown authored employment labels remain
literal. Chrome inserts a clear separator between contact and profile groups.
No candidate facts, selection policy, schema, approval or frontend code changed.

The document proof runner accepts an optional output directory so new verification
does not replace historical milestone artifacts. Its first diagnostic output was
preserved separately; only this task's generated changes to previous artifacts
were restored to their original committed bytes.

## Verification and open acceptance

Commands use the existing isolated environment helper plus
`--import ./tests/setup/studio-isolated-env.js` and
`--import ./tests/setup/approval-signing-env.js`. They never load the main private
environment files. No migrations run.

Final combined gate: **88 passed, 0 failed/cancelled/skipped**, four suites/eight
files, 27.806 seconds. Log: OS Temp `resume-quality-metadata-final.log`. Scope includes shared renderer contracts,
authoritative skill-selection and one-page regressions, draft/proposal contracts,
and real HTTP/PostgreSQL document security, conflict, rollback and approval checks.
Actual synthetic PDFs are under OS Temp `career-resume-quality-synthetic-20261015`.
The initial forced header-break experiment failed the dense overlap gate; a compact
separator replaced it. The gate was not relaxed; the final artifact run passes.
Fresh junior/mid/experienced/dense PDFs each pass exactly one A4 page, configured
10pt/measured 9.997499pt, embedded fonts/Unicode maps, selected-text preservation,
reading order and no detected clipping/overlap. Mid/dense rasters were inspected.
Overflow remains review-required without content pruning. Lint has zero errors
and five existing unused-declaration warnings in the shared generator; whitespace
checks pass. These checks do not establish candidate relevance or factual completeness.

Still required: exact source/target trace, source-grounded skill completeness and
relevance correction, decision disclosures, realistic backend/full-stack quality
matrix, and the owner's new before/after PDF with retention comparison. No corrected
personal resume or completed Milestone A is claimed. UI simplification remains gated
on the owner's subsequent resume acceptance. No commit, push or deployment.

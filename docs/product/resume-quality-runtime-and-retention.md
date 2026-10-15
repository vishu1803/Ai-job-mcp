# Milestone A: runtime diagnosis and offline skill retention

2026-10-15. Consolidated local main, baseline `ce03df2`. Overall acceptance is
**IN_PROGRESS**; authenticated investigation and the owner's corrected resume
remain **BLOCKED** on connection-security confirmation. UI redesign remains paused.

**Final availability update:** after the earlier connection-refused/502 checks,
both `http://127.0.0.1:3000/login` and `https://dev.aicareershub.tech/login` return
200 with Career Hub login HTML. A normal Node watch process (PID 28252, child
7452 at verification) is now present. A raw loopback TCP connection and native
HTTP request independently succeed. This task did not start/restart that process;
its appearance is an external runtime change. A concurrent listener inventory
briefly reported no matching object despite HTTP success; later process/raw-TCP
evidence establishes recovery. Do not report the server as still stopped.

The existing local environment files still do not configure the CA or explicit
verification flag. External process-environment overrides have not been verified.
Login availability does not prove database health, verified TLS, credential rotation
or access to the owner's records. No authenticated data endpoint was called.

## Runtime: observations versus unknowns

| Check | Verified result |
| --- | --- |
| Normal application | Initially no `src/index.js`/normal watch process or port 3000 listener; local login refused connection. Final check: normal watch process present and login 200. |
| Public development URL | Initially 502 through Cloudflare; final login check 200. Response bodies/private values were not logged. |
| Tunnel service | Windows Cloudflared service running; loopback metrics on port 20241 return 200 with positive tunnel HA connections. A connected tunnel does not establish origin health. |
| Upstream configuration | Service uses remotely managed ingress. No applicable local ingress file found. The actual managed origin URL has not been verified; do not claim it points to 3000 from port defaults alone. |
| Local configuration | Default application port 3000, host 0.0.0.0, configured development public origin. Approval/signing configuration passes pure offline validation; entrypoint/application syntax checks pass. |
| Startup/crash evidence | Available application log files are historical September logs; Windows tunnel events show service starts/stops, without a current application crash explanation. The exact reason the previous application exited is NOT_VERIFIED. |
| Database health | NOT_VERIFIED. No connection/query to the configured remote database was made. The stopped process is not evidence of a database outage. |
| Other app ports | 4317/4318 are preserved synthetic Studio review servers. They are not the owner's normal real-data application. |

The initial immediate availability defect was the absent normal local origin. This is
consistent with Cloudflare's documented origin-unreachable 502. The previous
restart attempt was rejected by automatic approval review **before process
creation**, citing the configured remote credential/TLS/rotation uncertainty.
It was not an observed application startup crash. No indirect restart or bypass
was attempted. Current successful public login establishes that the tunnel can
reach a working origin now; the exact managed ingress URL remains uninspected.

Sources: [Cloudflare troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/),
[tunnel observability](https://developers.cloudflare.com/tunnel/observability/).

## Smallest safe continuation, same existing Aiven service

No new database, login architecture, migration, data copy, tunnel reinstallation
or production deployment is needed by this diagnosis.

1. Owner confirms the previously exposed administrator credential was rotated or
   revoked. If already done, no second reset is requested. Otherwise use the
   **same existing PostgreSQL service → Users → exposed user → Reset password**,
   then update legitimate consumers through the existing private secret mechanism.
   Do not send the password/connection string in chat. Do not test the old password.
2. In that same service's **Overview → Connection information → CA Certificate →
   Download**, save the trusted CA privately and provide its local path. Confirm
   the service environment from its actual provider settings, not NODE_ENV.
3. Configure the existing `DATABASE_CA_CERT` with the PEM certificate contents
   (this variable is not a filename) and explicitly set
   `DATABASE_SSL_REJECT_UNAUTHORIZED=true`. No private environment file has yet
   been changed by this task. Hostname/certificate validation must succeed; do
   not use `NODE_TLS_REJECT_UNAUTHORIZED=0` or `rejectUnauthorized:false` as recovery.
4. The normal server is now externally running; do not start a duplicate or stop
   it speculatively. After prerequisites and approval review permit any needed
   configuration reload/restart, reuse the existing development command. Confirm
   loopback port 3000/login first, then the public login. If only public access
   fails, inspect this tunnel's managed Public Hostname ingress in Cloudflare
   and verify its intended HTTP origin/port against the actual app listener.
   Do not assume HTTPS just because the public URL is HTTPS.
5. Owner signs in normally. Use only the matching owned existing read services
   in [the read map](resume-quality-authenticated-read-map.md); avoid handoff GET
   and regeneration/approval/write actions. The application may perform normal
   session/audit bookkeeping; these are not zero-write SQL transactions.

The pool previously ignored an explicit verification opt-in in development.
The narrow local fix in `src/db/index.js` now honors that existing flag and CA in
development as well. Production behavior and other defaults are unchanged.
The configuration test uses synthetic values and no connection: it proves option
construction, **not** a successful Aiven TLS handshake or credential rotation.

Sources: [Aiven service users](https://aiven.io/docs/products/postgresql/howto/manage-service-users),
[Aiven CA and TLS verification](https://aiven.io/docs/platform/concepts/tls-ssl-certificates).

## Reproduced skill-loss boundary

The normal application generation and regeneration paths pass `profileView.skills`
to the structured composer while also carrying canonical
`profileMetadata.resumeData`. Identity, experience and education can use canonical
master facts, but the old skill path only read `meta.skills` or the indexed
`source.skills` plus additional skills. Explicit canonical-master skill assertions
could therefore be missing **before relevance selection**, even when they appeared
in other resume sections. This is a source projection defect, not a PDF glyph issue.

An owner-only local audit bundle, correlated in memory to the acceptance sample's
owner, contains a historical versioned canonical master with 28 skill strings.
Its stored job is not the exact Backend Engineering target. This supports the
mechanism but does not establish the current database inventory or exact package's
complete omission classifications. The audit material stays outside Git with
owner-only permissions; no private values appear in fixtures or this document.

Local correction in `structured-resume.service.js`:

- Reconcile explicit claims from an identity/version-bound canonical master with
  indexed skills, using existing technology normalization and skill trust policy.
- Preserve claims as CLAIMED, including an explicit master assertion that also
  has repository-only inference. Never upgrade these to independently VERIFIED.
- Respect explicit profile overrides/clears and explicit learning/gap states.
  A project stack or job keyword alone cannot authorize a new proficiency.
- Retain existing relevance, composition, one-page and approval services. Do not
  change source records, sealed packages, API contracts or schemas.

Synthetic seven-skill master: NestJS, Flask, TypeScript, Node.js, PostgreSQL,
Docker and Python. Indexed inventory deliberately contains only the first two
candidate claims plus inferred/missing entries. Same facts and job inputs in both
runs: the committed HEAD composer renders two dedicated skills; the corrected
composer renders all seven as CLAIMED. Neither run inserts optional Rust,
Kubernetes or unclaimed React. The same current renderer is used on both sides
to isolate the composer change; these are not the owner's personal before/after.

## Verification and artifacts

- Focused offline gate: **67 PASS, 0 FAIL/CANCEL/SKIP**, eight files, 4.479 seconds.
  Skill retention, two targets, source immutability, explicit clears, master
  identity, provenance/learning/gaps, integrity receipt, existing authoritative
  selection/source-grounding, metadata, environment and TLS configuration.
- Extended compatibility gate: **79 PASS, 1 FAIL**, 80 cases. The failure is the
  unchanged `tests/unit/db.test.js:150` single-schema assertion, while committed
  `drizzle.config.js` already lists both main and Studio schema modules. Both
  files are unchanged from HEAD. The same failure was reproduced using the HEAD
  database module through an isolated loader (10 pass, 1 fail). The first loader
  attempt used an invalid Windows import URL and failed before tests initialized;
  the corrected file-URL run is the baseline evidence, not that setup failure.
  No schema or migration was altered to satisfy it.
  Remaining structured-contract, candidate-profile, pool guard and draft/proposal
  cases pass. This is not an all-green combined suite or production acceptance.
- Six persona/target pairs: junior, mid-level and experienced (three roles/nine
  experience bullets) × backend/full-stack; twelve before/after actual PDFs.
  All retain their selected project and all experience bullets; after retains
  seven dedicated skills versus two before. Receipt PASS; inputs remain unchanged.
- Independent PyMuPDF checks all twelve: exactly one A4 page, minimum measured
  9.997499pt (configured 10pt, existing conversion tolerance), selected text
  including skills preserved, no out-of-page/overlapping spans, replacement
  glyphs or missing link annotations. These verify link targets, not external
  site availability. Chrome fallback is deliberately forced; native TeX not tested.
- Junior-backend, mid-full-stack and experienced-backend after rasters inspected.
  Experienced and mid-level use experience-first order, junior uses education-first.
  No career-stage policy change was made without the real source records.
- One synthetic project fact about database migrations is absent from the rendered
  project bullet while two other facts are consolidated. The existing claim
  validator rejects ordinary "Added"/"Wrote" openers as FRAGMENT_BULLET; these
  words are missing from its active-verb allowlist. Some rejected attempts also
  share fact IDs with later successful consolidated wording, so the raw omissions
  report cannot be equated directly with final fact loss. This upstream composition
  finding remains open, not a claim of complete source-fact
  retention. Saved composition/presentation audits distinguish these decisions
  from skill retention and final renderer preservation.

Artifacts: `output/pdf/resume-quality-retention/` contains paired PDFs, extracted
text, page rasters, selected views, before/after selection/composition audits and
`independent-inspection.json`. Synthetic data only. Runner:
`tests/product/verify-resume-quality-retention.mjs`; fixture:
`tests/fixtures/resume-quality-skill-retention.js`.
The baseline runner loads the committed composer through an isolated Node loader;
it never resets or overwrites working source.

Commands use the existing safe test environment preloader, which suppresses main
private environment loading. No remote DB, provider request, migration or candidate
regeneration was performed. Logs: OS Temp `resume-quality-offline-regressions.log`,
`resume-quality-compatibility.log`, `resume-quality-pdfs-{before,after}.log`,
`resume-quality-independent-pdfs.log`.

Still required: verify secure database configuration in the now-running normal
runtime; exact owner/master/target/package read trace;
per-skill and per-fact classifications; investigate actual career stage, project
selection and optional-section trade-offs; corrected personal PDF and retention
report; owner's manual Milestone A review. Do not mark this milestone complete or
resume UI work from synthetic checks alone.

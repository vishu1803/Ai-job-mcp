# Milestone A — existing authenticated read services

2026-10-15. **Source inspection complete; live record investigation BLOCKED on
application availability and the owner's authenticated session.** This supersedes
requiring a separate database or database login for the application-read approach.
No direct SQL or new connection logic has been introduced.

Latest runtime and offline correction evidence is in
[the runtime and retention report](resume-quality-runtime-and-retention.md).
Initially no normal origin process/listener was present on 3000; the Cloudflare
service had active tunnel connections. At final verification a normal watch
process had appeared externally and local/public login both return 200; this task
did not start it. Aiven health and the managed ingress URL remain unverified.
No separate database/login is requested. The existing pool now
honors explicit verified-TLS configuration in development; this was tested without
connecting. Credential-rotation confirmation and the trusted CA are still needed
before database-backed reads, followed by the owner session. Offline synthetic skill-retention
work has proceeded independently; it does not substitute for the exact saved
package trace.

## Existing read paths

| Needed record | Existing interface and service | Boundary / limitation |
| --- | --- | --- |
| Profile and reconciled skills | `GET /api/profile/bootstrap`; `CandidateProfileService.getCareerProfile` | Session-owned candidate. Bootstrap is a frontend projection, not the full source snapshot; its experience fields use explicit user customizations. Do not interpret empty DTO fields as absent master facts. |
| Complete skill classifications | `GET /skills/combined` and `/skills/additional`; `CandidateAdditionalSkillsService` | Authenticated user resolves its candidate. Preserve claimed, learning and repository inference distinctions. |
| Canonical master, source sections, claims | `GET /resumes` and `/resumes/:id` with `Accept: application/json`; `SourceResumeIngestionService.listResumes/getResumeDetails` | Session tenant and candidate scope. Read only the designated canonical master relevant to the matching package. |
| Related evidence | `GET /candidate/evidence?skillId=…&limit=20&offset=0` and `/candidate/evidence/:id`; `DataSovereigntyService` | Existing tenant/candidate ownership and bounded evidence paging. Read related skills/projects only. |
| Matching application | `/applications` with bounded pagination, `/applications/:id/apply`; `ApplicationTrackingService.getApplication/getApplicationDetails` | Existing application/candidate ownership. HTML apply page is not a full JSON package export. |
| Exact job description | `GET /resume-studio?applicationId=…` | Session-owned context populates stored title/company/raw JD without creating a draft. Do not trigger analysis, creation or autosave. |
| Stored selection, composition and package | Existing authenticated MCP `get_application_package`; `ApplicationTrackingService.getApplicationPackage` | Returns the stored complete application package and contract/version information after ownership and current evidence-policy checks. Uses existing authorized MCP authentication, not a newly minted token or fake context. Do not bypass quarantine. |
| Original saved PDF / TeX | `GET /api/applications/:id/artifacts/resume/view`, `/artifacts/resume-tex/view` with matching version | Ownership/hash/evidence policy validated before decrypting stored bytes; not a compilation or regeneration request. |

The existing service layer contains the needed profile/master/evidence/package
read operations. **Direct database queries have not been established as necessary.**
Once the owner session is available, check the responses before deciding whether
an existing read projection is incomplete. Do not create a new API or parallel
truth model speculatively.

Read routes need inspection for incidental effects: `validateSession` can update
its sliding activity timestamp; several web routes call `getOrCreateCandidate`
(only read if the candidate already exists); MCP transport writes normal audit
events. These are not zero-write SQL transactions. Do not claim otherwise, disable
authentication/auditing or let a missing candidate be created as part of this audit.
Confirm the existing candidate through a noncreating owned read first.

## Paths to avoid

`GET /applications/:id/handoff` is **not always read-only**. If a handoff is missing,
the route can call document generation and persist its result. Do not navigate it
as a source retrieval shortcut. No regenerate/prepare/resolve/approve/restore/
submission POSTs, source reapproval, draft creation, provider calls or migrations.

Profile MCP output caps top skills/projects/experience. It must not be the sole
inventory used to conclude a candidate lacks a skill; corroborate against the
complete master/skill read views. Stored artifact text alone cannot establish
independent verification or explain which source skills were omitted.

## Actual availability check

- Normal main application expected on loopback port3000: connection refused.
- Configured public origin `https://dev.aicareershub.tech`: HTTP502, confirmed by
  a status-only public-login request outside network sandbox restrictions.
- Ports4317/4318 respond, but their Node entries are the earlier synthetic
  `serve-studio-visual.mjs` fixtures. Their unauthenticated bootstrap calls return401.
  They must not be used as the owner's real acceptance data.
- Browser/native automation initialization fails before execution with
  `failed to write kernel assets`; no user browser session/cookies were accessed.
- Requested restart of the normal `src/index.js` app was rejected by automatic
  approval review before process creation. Stated reason: existing remote role,
  environment, TLS verification and administrator rotation remain unverified.
  No workaround or indirect restart was attempted. Specific owner authorization
  was requested for restarting the existing app for authenticated reads under
  its current configuration, with those risks disclosed, or a different running URL.

## Next operation

After the application is available and the owner signs in normally, capture only
the matching owned read responses in protected local material; print status/counts,
not personal records/cookies/tokens. Compare master skills and reviewed assertions
with current reconciled skills, exact target requirements, stored tailoring plan,
presentation decisions, composed skills and final PDF/TeX. Classify each omission
at its actual boundary before changing code. No candidate facts will be inferred
from technology names appearing in the PDF alone.

Any later need for direct SQL requires a separate explanation of the missing
application-read capability and explicit authorization of that specific operation,
including the retained TLS/rotation risks. No direct access is currently requested.
Milestone B remains paused. No business records or product code changed in this
follow-up; earlier local formatting fixes and their historical88-test result remain
preserved, not rerun or promoted to content-quality acceptance.

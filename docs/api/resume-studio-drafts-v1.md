# Resume Studio persistent drafts — contract 1.1.0

Slice STUDIO-BE-002. This adds draft endpoints; `/analyze` and its contract 1.0.0
remain unchanged. Draft content uses `studio-draft/1.0.0`, a loss-preserving source
editing model, not the generated export schema 2.0.0. Existing source section schemas
and normalizers are reused. Generating or approving an application is separate.

## Endpoints

All paths use `/api/v1/resume-studio`. Success is `{success:true,data:<draft>}`.
Executable schemas: `src/domain/career/resume-studio-draft.schemas.js`. Portable
JSON Schemas: `docs/api/resume-studio-drafts-v1.schema.json` (createRequest,
updateRequest, params, responseData). Full synthetic fixtures in `tests/fixtures/`:
resume-studio-draft-create-request.json, resume-studio-draft-created.json,
resume-studio-draft-update-request.json, resume-studio-draft-updated.json,
resume-studio-draft-conflict.json. Replace synthetic IDs with the caller's source/node IDs.
Regenerate with `node scripts/export-resume-studio-draft-contracts.mjs`. Request refinements
for nonempty changes and unique selection IDs have explicit JSON Schema equivalents;
ownership, known-node membership and valid source date ordering are server checks.

| Method/path | Status | Contract |
| --- | --- | --- |
| POST /drafts | 201 | `{source:{kind:"RESUME",resumeId:<UUID>},jobTarget:<Slice1 target>}` |
| GET /drafts/:id | 200 | No request body; id must be UUID |
| PATCH /drafts/:id | 200 | `{expectedRevision:<positive integer>,edits?:[{nodeId:<UUID>,text:<string|null>}],selection?:{experienceIds?:[UUID],projectIds?:[UUID],bulletIds?:[UUID],skillIds?:[UUID]}}` |

Create requires an owned designated BASE_RESUME and its candidate-reviewed canonical
snapshot with the same resume ID/version. An arbitrary upload, non-master resume or
unlinked/stale canonical snapshot is rejected, without reparsing or inventing fields.
PROFILE cloning was a planned Slice1 alternative, not an available endpoint contract;
it is deferred. This slice clones the reviewed canonical master only. The original
encrypted document, parsed sections, candidate profile/claims and approvals are unchanged.

The response includes contractVersion, id, candidateId, revision, status=DRAFT,
sourceResumeId/sourceVersion/sourceContentHash/sourceSnapshotHash, contentHash,
createdAt/updatedAt, jobTarget, parsed jobDescription, warnings, immutable masterSnapshot,
structuredResume, nodes, nodeProvenance and selection. masterSnapshot is the normalized
source baseline; sourceSnapshotHash additionally covers persisted raw canonical facts,
sections and candidate claims. Hashes are draft integrity identifiers, NOT approval seals.

Each node has an opaque stable UUID, kind, server-owned path, parentId and editable flag.
Use node IDs for edits and selection; never calculate IDs from array positions. Entry
nodes select experience/project/skill items; bullet nodes select individual bullets.
Editable text nodes expose summary, experience/project wording and supported identity
fields. Supported field paths are determined by the server inventory. Structural ID,
provenance, evidence, ownership, job target and approval fields cannot be patched.
Edits are explicit candidate-authored CLAIMED content; source provenance stays intact.
An explicit experience end-date edit updates the existing current-role flag: Present,
Current or Ongoing sets it true and normalizes endDate to null; another supplied end date sets it false. Clearing an
end date retains the flag and does not infer current employment. This prevents an old
flag masking a candidate-supplied date in the compiled document. Payload shapes stay 1.1.0.
This endpoint does not independently verify edited metrics/technologies/qualifications
or make edits eligible for export. All export/approval validation gates remain required.
Null clears nullable fields; empty strings are accepted only where the source schema
allows them. Bullet omission uses selection instead of deleting its source text.

Selection arrays contain INCLUDED node IDs of that kind. Omitted selection keys remain
unchanged; an empty array explicitly excludes all items of that kind. Parent and bullet
flags are independent, so re-including a role/project restores its retained bullet flags.
Effective inclusion requires both parent and bullet selection. Default selection includes
all experience, skills and bullets, plus the first two source projects in source order.
This is not a relevance recommendation. All source projects remain stored; explicit
project selection is limited to four. Duplicate, unknown or wrong-kind IDs are rejected.

## Authorization, conflict and persistence semantics

Existing session cookies and CSRF tokens apply. Create/update require OWNER or MEMBER;
READONLY can read only their own draft. Tenant-owner status never grants another user's
Studio access. Foreign source/draft IDs return404 before revision/state disclosure.
Mutations require the existing session-bound x-csrf-token and trusted Origin/Referer.
No identity headers or new bearer-token scheme. JSON APIs return Cache-Control:no-store.

400 VALIDATION_ERROR for invalid fields/IDs/selection;401 existing session errors;
403 FORBIDDEN or existing CSRF codes;404 NOT_FOUND for missing/foreign IDs;
409 CONFLICT with `error.details[0].reason`:
MASTER_NOT_READY, MASTER_SNAPSHOT_UNAVAILABLE, or DRAFT_REVISION_CONFLICT.
Revision conflict includes expectedRevision and actualRevision, but no foreign content.
413 DRAFT_TOO_LARGE for payloads above the documented encrypted-storage bound.
Unexpected or corrupted storage fails closed with sanitized500. No raw content in logs.

Every accepted PATCH increments revision once, even if values equal their previous
values. expectedRevision is required for every mutation, including selection-only
changes. Transactional row locking plus compare-and-swap prevents lost updates across
processes. A stale request never changes text, selections, hashes or audit history.
All edits and selection changes validate before persistence; invalid mixed patches roll
back entirely. Immutable encrypted revision records and sanitized revision/hash audit
events are written atomically. History/restore endpoints are outside this slice.

Draft source snapshots and revision payloads use existing AES-256-GCM/key-version
support, split into authenticated bounded chunks inside one transactional PostgreSQL
value. Decrypted envelopes bind draft ID, tenant, user, candidate, source hash and revision;
hash verification rejects corruption, ciphertext replay and swaps. Each source and each
revision is limited to1MiB plaintext; excessive input is rejected, never truncated.
Only pasted job text follows Slice1's explicit warned parser truncation rules.

## Migration and acceptance gates

Additive migration0022 creates separate draft/revision tables and scope/revision/immutable
guards. No old resume/application/approval row is migrated or rewritten. Older servers
ignore the new tables; removing the new route registration restores old application
behavior while retaining draft data. No destructive down migration is authorized.
Delete of a tenant/user/candidate cascades its drafts/revisions. Removing an original
resume does not delete an independent draft; historical source ID/hash remain recorded.
Later export must revalidate any evidence, not treat a historical snapshot as fresh proof.

Acceptance: genuine database/HTTP/session creation/read/update; unchanged master bytes,
sections/profile/claims; edit/selection persistence across new service/app instances;
real competing writes yield exactly one winner and one409; stale/ABA edits rejected;
all-or-nothing validation and transaction rollback; tenant AND same-tenant user isolation;
READONLY and CSRF guards; encrypted storage tamper/replay/swap rejection; source-provenance
immutability; no approval/package side effects; migration replay and Slice1 regressions.
No AI proposals, history UI, preview, fit, exports, approval or submission in Slice2.

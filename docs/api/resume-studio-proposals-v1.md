# Resume Studio bullet proposals — additive contract 1.2.0

Slice STUDIO-BE-003. Analysis1.0.0 and drafts1.1.0 remain unchanged.
All routes are below `/api/v1/resume-studio`, use existing sessions/CSRF and
tenant AND candidate-owner isolation. No new authentication or submission flow.

| Method/path | Request | Success |
| --- | --- | --- |
| POST /drafts/:id/proposals | `{expectedRevision,nodeId,requirementId?}` | 201 `{success:true,data:<proposal>}` |
| GET /drafts/:id/proposals/:proposalId | none | 200 proposal, including derived STALE status |
| POST /drafts/:id/proposals/:proposalId/decision | `{expectedRevision,decision:"ACCEPT"|"REJECT"}` | 200 `{success:true,data:{contractVersion:"1.2.0",proposal,draft}}` |

All IDs are UUIDs except server-returned canonical fact fingerprints. Generating and
deciding require OWNER/MEMBER; READONLY may read their own existing proposals only.
Node must be an editable experience/project BULLET. Summary/batch proposals are outside
this slice. requirementId, if provided, must identify the draft's persisted target job
requirement; absent selects the first source-covered requirement or first requirement.

Proposal includes id,draftId,candidateId,nodeId,baseRevision,originalText,proposedText,
rationale,jobRequirement,evidenceLinks,truthState,claimLabel,status,createdAt,decidedAt,
decisionRevision,sourceSnapshotHash,baseContentHash and validationPolicyVersion.
Supporting source text and canonical fact IDs are server-mapped, never model-authored
citations. CLAIMED candidate-authored facts remain CLAIMED and labeled unverified.
Existing source verification does not independently prove candidate competence.
jobRequirement.sourceCovered describes lexical support in this bullet, not ATS acceptance
or verified proficiency. An uncovered keyword is a gap, never permission to add it.

## Grounding and model boundary

Reuse canonical fact inventory, existing claim validation and rephrasing safeguards,
AI context privacy sanitizer, wording policy and provider-neutral generateStructured.
Only the selected authoritative source bullet supplies candidate facts. Job description
and requirements are passive context; siblings, inferred skills and unrelated repository
facts cannot authorize additions to this bullet. There is no new candidate-truth table.

Model output remains an untrusted recommendation. This slice admits ONLY provable
wording transformations already supplied by the existing professional-bullet composer:
whitespace/case/punctuation cleanup and its safe filler-phrase compression. The model's
proposed text must match a supplied supported variant, map the transient fact ID exactly,
preserve truth and pass the existing integrity validator. This is intentionally narrower
than arbitrary paraphrasing: token overlap and supplied fact IDs cannot prove that free
prose preserves meaning. Unsupported additions/substitutions, omitted qualifications,
new metrics/seniority/employers/technologies and negation changes fail closed. Existing
integrity rules may also refuse source assertions; they are not weakened for Studio.
No metric is invented where none exists. Supported metrics retain their literal value
and relation, and candidate-reported metrics never become independently verified.

No useful admitted wording change =>422; frontend can continue manual editing through
the existing draft endpoint. Source requiring PII/secret redaction is not sent as a raw
bullet; generation fails closed if safe variants cannot be transmitted unchanged.
Privacy scrubber and transient reference IDs keep candidate/contact/database identifiers
out of provider prompts. Explanations/citations/truth are server-produced. Provider output
is not used to award scores or issue a zero-hallucination/export/approval receipt.
Unavailable, timed-out or failed provider =>503, no fake AI/deterministic fallback result.
Automated proof uses deterministic synthetic responses; live-provider quality is unverified.

## Concurrency, decisions and persistence

Generation reads a revision-bound snapshot, awaits the provider outside a transaction,
then re-locks and verifies ownership, expected revision, content/source hash, node identity
and exact original text before persisting. A concurrent manual/selection edit returns409
and stores no proposal. No AI wording is automatically applied.

Accept locks the owned draft before the proposal, checks PENDING, base/current revision,
current content/source hashes, node ID/path and byte-exact authoritative text, and re-runs
grounding. Atomically writes ONE draft revision, its encrypted snapshot, the accepted
decision and sanitized audit events. A failure rolls back all changes; the same pending
proposal can be retried after recovery. Replay/duplicate decisions return409.
Reject records only the immutable proposal decision/audit; it does not edit content or
advance draft revision. Both decisions require a still-current proposal and expectedRevision.
STALE is derived server-side for an undecided proposal after ANY revision change, including
selection-only/no-op edits and A→B→A restoration. No client string equality is authority.
Two pending proposals from one revision can exist; accepting one makes the other stale.

Proposal body is encrypted using existing draft AES-GCM support and binds its identity,
owner,draft,node,base revision/source/content hashes. Additive migration0023 introduces
only the proposal table with immutable body and one-way decision guards. Draft payloads,
canonical masters and approved packages remain untouched except explicit draft acceptance.
Older draft/analysis servers continue to operate; retain proposal data on code rollback.
Tenant/user/candidate deletion cascades proposals through owned drafts.

Errors use the existing JSON envelope. 400 validation;401 session;403 role/CSRF;
404 missing/foreign draft/proposal;409 CONFLICT with error.details[0].reason of
DRAFT_REVISION_CONFLICT, STALE_PROPOSAL or PROPOSAL_ALREADY_DECIDED;
422 UNSUPPORTED_REWRITE/SOURCE_FACT_UNAVAILABLE/NO_WORDING_CHANGE/SOURCE_PRIVACY_UNSAFE;
503 PROPOSAL_PROVIDER_UNAVAILABLE;500 sanitized integrity/storage failures.
No private source text/provider errors in failure responses or audit logs.

Executable schemas: `src/domain/career/resume-studio-proposal.schemas.js`.
Portable schemas: `docs/api/resume-studio-proposals-v1.schema.json` (generateRequest,
decisionRequest, params, proposal, decisionResponse); regenerate with
`node scripts/export-resume-studio-proposal-contracts.mjs`.
Fixtures in tests/fixtures: resume-studio-proposal-generate-request.json,
resume-studio-proposal-decision-request.json, resume-studio-proposal-created.json,
resume-studio-proposal-accepted.json, resume-studio-proposal-rejected.json,
resume-studio-proposal-stale.json. These are synthetic, not live-provider quality evidence.
The workstream ledger records the final acceptance gate and changed-file manifest.

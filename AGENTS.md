# AI PROJECT OPERATING PROTOCOL

This repository is governed by three project-control documents:

1. `AGENTS.md` — mandatory operating rules for AI agents.
2. `goal.md` — strategic source of truth defining what the project is, why it exists, architectural principles, scope, and long-term direction.
3. `project.md` — living execution tracker recording what has actually been implemented, verified, blocked, deferred, and planned.

These documents are part of the project itself.

Do not treat them as optional documentation.

---

# 1. MANDATORY START-OF-TASK PROTOCOL

Before performing ANY task in this repository, regardless of task size, you MUST:

1. Read `AGENTS.md`.
2. Read `goal.md`.
3. Read `project.md`.
4. Identify the current project phase.
5. Identify the current task/status relevant to the requested work.
6. Check project dependencies, blockers, constraints, and previous decisions.
7. Determine whether the requested task is consistent with `goal.md`.

Do not begin implementation before completing these steps.

For a trivial request, still read the files.

For a large task, read the relevant sections in detail.

---

# 2. GOAL.MD IS THE STRATEGIC SOURCE OF TRUTH

`goal.md` defines:

* project mission
* product vision
* architectural principles
* project boundaries
* major objectives
* non-goals
* security principles
* provider-neutral design
* long-term direction

Do not silently change the strategic direction of the project.

If an implementation request conflicts with `goal.md`:

1. Identify the conflict.
2. Explain it briefly.
3. Prefer an implementation that satisfies the request without violating the goal.
4. If the requested change genuinely requires changing the project direction, record the issue in `project.md` rather than silently changing `goal.md`.

Never rewrite the project vision simply because an individual implementation task is convenient.

---

# 3. PROJECT.MD IS THE MANDATORY EXECUTION LEDGER

`project.md` records reality.

After EVERY completed task, you MUST update `project.md`.

This includes:

* feature implementation
* bug fixes
* refactoring
* configuration changes
* architecture changes
* dependency changes
* infrastructure work
* integrations
* testing
* documentation work when it changes project state
* security changes

Do not finish a task and leave `project.md` unchanged.

---

# 4. TASK COMPLETION PROTOCOL

A task is NOT considered complete immediately after code is written.

The required lifecycle is:

REQUEST
↓
READ CONTROL DOCUMENTS
↓
IMPLEMENT
↓
VERIFY
↓
DOCUMENT RESULT
↓
UPDATE `project.md`
↓
REPORT COMPLETION

Never skip the verification step when verification is reasonably possible.

Never mark a task COMPLETE based only on intention or source-code existence.

---

# 5. UPDATE PROJECT.MD BEFORE REPORTING SUCCESS

Before telling the user that the requested task is complete:

1. Verify the result.
2. Update the relevant task in `project.md`.
3. Update the task status.
4. Record verification/evidence.
5. Update phase progress when affected.
6. Record blockers or limitations if present.
7. Record architecture decisions when applicable.
8. Record the next logical task when useful.

Only after these steps may the task be reported as complete.

The final response must reflect the actual state recorded in `project.md`.

---

# 6. NEVER INVENT COMPLETION

Use these statuses accurately:

* NOT_STARTED
* IN_PROGRESS
* BLOCKED
* COMPLETE
* DEFERRED

Use `COMPLETE` only when:

* implementation exists,
* expected behavior has been verified,
* relevant tests/checks have passed where applicable,
* and the result has been recorded in `project.md`.

If verification failed:

Use `BLOCKED` or `IN_PROGRESS`.

If only part of the work was completed:

Record exactly what is complete and what remains.

---

# 7. PROGRESS MUST REPRESENT REAL WORK

Do not inflate project percentages.

Completion percentages must be derived from actual completed tasks/milestones.

Never mark future work complete.

Do not count these as completion:

* planning
* assumptions
* generated code that has not been tested
* placeholder files
* mocked integrations that are not the real integration
* documentation claiming something works
* configuration without successful verification

Distinguish between:

* planned
* implemented
* locally verified
* integration verified
* production verified

---

# 8. DO NOT CHANGE GOAL.MD CASUALLY

`goal.md` should change rarely.

Normally:

* implementation work → update `project.md`
* task planning → update `project.md`
* architecture decision → update `project.md`
* long-term product direction change → potentially update `goal.md`

If you believe `goal.md` needs changing:

1. Explain why.
2. Record the proposed change in `project.md`.
3. Do not silently rewrite the goal.
4. Only update `goal.md` when the project direction has genuinely changed.

---

# 9. MAINTAIN TRACEABILITY

Important work should be traceable.

When possible, record:

* task ID
* files changed
* implementation summary
* verification command
* verification result
* relevant commit/PR
* known limitation
* dependency
* architectural decision

Example:

P2-004
Status: COMPLETE
Changed:

* src/connectors/github/*
* src/services/candidate/*
  Verification:
* npm test
* npm run build
  Result:
* PASS

---

# 10. SECURITY IS NON-NEGOTIABLE

Never:

* commit secrets
* expose API keys
* expose OAuth tokens
* place private credentials in frontend code
* weaken authentication merely to make development easier
* grant unnecessary permissions
* bypass authorization
* expose one user's resources to another user
* create global provider credentials for all users
* disable security checks without documenting why

Development shortcuts must not become architecture.

---

# 11. MULTI-USER ISOLATION

This project is intended to support multiple users.

Any feature handling user resources must consider:

* authentication
* authorization
* tenant isolation
* ownership
* connector permissions
* token isolation
* data access boundaries
* deletion/revocation

Never implement a feature assuming only one user exists unless the task explicitly concerns temporary local development infrastructure.

---

# 12. PROVIDER-NEUTRAL ARCHITECTURE

Do not hard-code the core platform around a single AI provider.

The intended architecture is:

Resource Connectors
↓
Unified Data Model
↓
Career Intelligence
↓
Action Services
↓
MCP Interface
↓
AI Client

Gemini is the first AI integration.

Claude and ChatGPT are later integrations.

Do not introduce Gemini-specific assumptions into the business/data model unless they belong specifically to the Gemini integration layer.

---

# 13. RESOURCE CONNECTORS

Users must eventually be able to connect their own resources.

Potential resources include:

* GitHub
* GitLab
* Google Drive
* OneDrive
* Notion
* uploaded documents
* portfolio
* future custom connectors

Resource connectors must be isolated from the career-intelligence layer.

A connector provides access to authorized resources.

The career engine consumes normalized information.

---

# 14. EVIDENCE-BASED AI

The system must not fabricate candidate qualifications.

Do not invent:

* work experience
* projects
* certifications
* technologies
* responsibilities
* employment history
* achievements
* education
* professional claims

When adapting applications, distinguish between:

VERIFIED
INFERRED
CLAIMED
MISSING

Prefer evidence from authorized user resources.

---

# 15. EXTERNAL ACTIONS REQUIRE APPROPRIATE APPROVAL

Actions affecting external systems must use appropriate authorization.

Examples:

* modifying repositories
* creating commits
* creating pull requests
* sending messages
* submitting job applications

Do not automatically perform consequential actions merely because an AI recommended them.

Prefer:

AI recommendation
↓
User approval
↓
Action
↓
Verification
↓
Audit record

---

# 16. IMPLEMENTATION DISCIPLINE

Avoid unnecessary complexity.

Prefer:

* modular architecture
* clear interfaces
* testable services
* incremental implementation
* minimal dependencies
* modular monolith before microservices
* least privilege
* observable behavior

Do not build infrastructure merely because it might be useful someday.

Implement according to the current phase in `project.md`.

---

# 17. WHEN REQUIREMENTS ARE UNCLEAR

Do not invent major product requirements.

Use the existing information in:

* `AGENTS.md`
* `goal.md`
* `project.md`
* existing architecture
* current codebase

Resolve minor implementation details using engineering judgment.

For significant architectural ambiguity:

* document the assumption,
* record it in `project.md`,
* choose the safest reversible option.

Do not repeatedly ask the user questions for information already available in project documentation.

---

# 18. WHEN A TASK IS OUTSIDE THE CURRENT PHASE

Do not silently redesign the project.

Determine whether the task is:

* valid for the current phase,
* a small prerequisite,
* a later-phase feature,
* or a scope change.

If it is a later-phase feature, implement only when explicitly requested or when it is necessary to complete the current task.

Record important scope decisions in `project.md`.

---

# 19. AFTER EVERY TASK

Before final response, perform this checklist:

[ ] Read `goal.md` before implementation
[ ] Read `project.md` before implementation
[ ] Confirm task aligns with project goals
[ ] Implement requested work
[ ] Verify implementation
[ ] Update `project.md`
[ ] Update status
[ ] Update progress if necessary
[ ] Record verification
[ ] Record blockers/limitations
[ ] Record architecture decision if applicable
[ ] Ensure no secrets were introduced
[ ] Ensure final response matches actual project state

This checklist is mandatory.

---

# 20. NEVER SKIP PROJECT.MD

The following is a hard rule:

NO TASK IS COMPLETE UNTIL `project.md` HAS BEEN UPDATED.

If a task modifies the repository but `project.md` has not yet been updated, the task remains incomplete.

The agent must update `project.md` before reporting success.

---

# 21. END-OF-SESSION PROTOCOL

At the end of any meaningful work session:

1. Update `project.md`.
2. Record completed work.
3. Record incomplete work.
4. Record blockers.
5. Record verification results.
6. Record next recommended task(s).
7. Ensure the progress percentage reflects reality.

Do not leave project state only in chat history.

The repository documentation must contain the state needed for the next agent/session to continue correctly.

---

# 22. SOURCE OF TRUTH PRIORITY

When information conflicts, use this priority:

1. Current verified project code and test results
2. `goal.md` for strategic direction
3. `project.md` for execution state
4. `AGENTS.md` for operating protocol
5. Official external documentation
6. Previous conversational assumptions

Never treat an old chat assumption as stronger evidence than the current repository state.

---

# 23. CORE RULE

The agent must behave as though every task is part of a long-running engineering project, not as an isolated chat request.

Every task must preserve:

* project direction
* architecture
* security
* traceability
* reproducibility
* progress accuracy

The required lifecycle is always:

READ → PLAN → IMPLEMENT → VERIFY → UPDATE PROJECT.MD → REPORT

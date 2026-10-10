# GitHub installation historical-link failure

Date: 2026-10-10. Scope: development installation `155430459`, initial read-only
investigation, focused request logging repair, and subsequently explicitly
authorized guarded historical-association restoration. Production remains NO-GO.

## Verified development database state before restoration

Inspection used the effective development environment configuration and a
PostgreSQL `BEGIN READ ONLY` transaction (`transaction_read_only=on`). Only
ownership/status/timestamps, whitelisted audit fields, index definitions and
aggregate resource statuses were selected. No credentials, tokens, state rows,
repository contents or private profile data were selected or decrypted. The
initial sandbox connection was denied; the authorized retry used the existing
application nonproduction TLS profile after certificate-chain validation failed.
No application TLS configuration changed. The completed transaction rolled back.

| Field | Observed value |
| --- | --- |
| Connection | `1743c149-bf4c-4c4e-a1fa-0532dfd5460a` |
| Tenant | `24d53f53-780e-4431-b065-32180c354175` (same tenant as supplied callback context) |
| Linking user | `9dd8e4fb-456b-4104-9cb1-c839a544b721` (same user; ACTIVE OWNER in that tenant) |
| GitHub numeric account | `97516061` |
| Connection status | DISCONNECTED |
| Installation column | NULL |
| Created | 2026-08-21T15:05:24.373Z |
| Last validated | 2026-08-30T11:06:38.978Z |
| Updated | 2026-10-08T14:40:57.042Z |
| ISSUE-01 authority-policy metadata | Absent |
| Resources attached to this connection | Ten DISCONNECTED |
| Row currently claiming installation 155430459, any tenant | None |

An audit `github.installation_linked` on August21 and repeated
`github.installation_updated` records through August30 associate this same
connection, tenant and user with installation155430459. These establish a
historical recorded link, not current GitHub consent or modern ISSUE-01
verification. The current failed transaction has not created a partially ACTIVE
connection. The prior record is disconnected and lacks its installation column.
The inspection cannot establish who/what cleared that column; the current
disconnect implementation scrubs credentials/status but does not clear it.

## Root cause and boundaries

`GitHubInstallationService.linkInstallation` consumes authorization state before
network verification, exchanges the code with PKCE, matches the logged-in numeric
GitHub identity, checks user-accessible installation and personal ownership or
active organization-admin authority, and checks App identity/permissions and
suspension. It then calls `upsertGitHubAppConnection` in a transaction with audit
creation. State remains consumed if this later transaction fails; replay must
reject `DURABLE_STATE_UNAVAILABLE` without additional provider calls.

`src/db/repositories/connection.repository.js` inserts with
`ON CONFLICT DO NOTHING`. Two actual deployed UNIQUE indexes matter:

- `(tenant_id, provider, external_account_id)` rejects another row for the current
  tenant's existing GitHub account, even when its installation column is NULL.
- Global partial `(installation_id)` for non-null GITHUB_APP installations
  arbitrates installation ownership across all tenants, including concurrent and
  direct writers.

After any insert conflict, the repository looks up only `installation_id` and
locks that row. An absent row, different tenant or different numeric account
raises CONFLICT/409 with internal reason INSTALLATION_ALREADY_LINKED. A lost
update also uses this reason. In this case the account index causes the conflict
and the installation lookup finds nothing: the reason is misleading. It is not
evidence that another tenant owns the installation. Ownership/error contracts
were not altered by this audit.

Existing reconnect safely reuses a non-null installation row only when tenant
and freshly verified numeric account match, under the existing row lock/global
unique index. Verification precedes the upsert; a failed identity check does not
refresh credentials or update the row. Tenant membership/roles, same-site
cookie/state/session binding, expiry, one-time durable consumption, PKCE,
App/installation identity, personal/org-owner authority and audit atomicity remain
enforced. Merely knowing an installation ID grants no authority.

`GET /sources` filters by current tenant, GITHUB_APP and ACTIVE. It does not hide
a current successful active connection in the controlled test. It intentionally
does not show this disconnected record as connected. Displaying inactive history
could improve recovery UX, but promoting a disconnected row to ACTIVE is not a
UI repair and was not done.

## Original recovery proposal (subsequently authorized and executed below)

At the initial audit, no development ownership or connection record had been
updated/deleted. The proposed
bounded administrative repair preserves the existing connection ID and all
tenant/user/account bindings, restores only its missing installation association,
and keeps DISCONNECTED status and scrubbed credentials until a new successful
GitHub flow. It must be atomic with an audit record and abort if the snapshot has
changed, an installation is now claimed, or any guard fails. It must not reactivate
resources or mint approval tickets.

The guarded update reviewed at that time is below. Before authorizing or
executing it, lock/recheck the connection, confirm historical audit association,
assert the intended development database and both unique indexes, and use a
transaction that records an administrative repair audit. Read the locked row's
full-precision `updated_at::text` into the `locked_updated_at` SQL parameter;
the display timestamp above has JavaScript millisecond precision only. Exactly one affected
row is required, otherwise roll back. A competing installation claim must fail
under the existing global UNIQUE index; never resolve it by deleting its owner.

```sql
UPDATE resource_connections
SET installation_id = '155430459', updated_at = now()
WHERE id = '1743c149-bf4c-4c4e-a1fa-0532dfd5460a'
  AND tenant_id = '24d53f53-780e-4431-b065-32180c354175'
  AND user_id = '9dd8e4fb-456b-4104-9cb1-c839a544b721'
  AND provider = 'GITHUB_APP'
  AND external_account_id = '97516061'
  AND status = 'DISCONNECTED'
  AND installation_id IS NULL
  AND updated_at = :'locked_updated_at'::timestamptz
RETURNING id, tenant_id, user_id, installation_id, status;
```

After the separately authorized repair, initiate a **new** connection at public
Sources, complete both callbacks with fresh GitHub identity/ownership checks,
confirm the existing connection ID is reused and ACTIVE with an audit, then
reselect/synchronize the authorized repositories. Ten disconnected resources do
not become usable merely because the connection was restored. Regenerate
application packages and explicitly review/approve fresh content. Old callback
URLs cannot be retried and old packages/approvals must not be blessed.

An alternative future code repair could handle a same-owner account-row conflict
inside the verified claim transaction while locking the legacy row and retaining
both UNIQUE constraints. That transition needs explicit scope/authorization and
regressions for foreign tenants/users/accounts, changed non-null installation IDs,
concurrent claims and rollback. It has not been implemented here.

## Request logging repair and verification

`src/utils/log-url.js` supplies a pure path-only formatter, used by the Pino
request serializer, response-contract failure logging and not-found logging.
Query/fragment values are omitted, so code/state, duplicate parameters and
percent-encoded parameter names cannot leak through those full request URLs.
Request URLs/query objects passed to handlers remain untouched; method/path,
request ID, response status and existing error diagnostics remain available.
This is bounded request URL repair, not a claim that arbitrary manually logged
strings or pre-existing logs are scrubbed.

Tests add real HTTP terminal capture for login/install/authorize paths and
response-validation500/missing-route404, verifying no synthetic query secrets in
output and unchanged parsed handler values. PostgreSQL/HTTP regressions reproduce
the historical same-account collision/409 followed by replay401, unchanged row
and audit, disconnected Sources display, and fresh same-owner authority
verification/reuse with active Sources display. Existing cross-tenant/race/direct
insert/rollback/state/PKCE/organization-owner tests remain in the selected gate.
Only outbound GitHub HTTP is a fixture: these do not verify live GitHub consent.
Final counts and commands are recorded in project.md.

## Authorized development restoration completed

The user subsequently explicitly authorized restoring only the missing
installation association on the named historical connection, after reverifying
ownership and uniqueness. The guarded transaction was dry-run with rollback,
then applied and committed. A separate post-commit read confirmed installation
`155430459` on connection `1743c149-bf4c-4c4e-a1fa-0532dfd5460a`, still
**DISCONNECTED**. No fresh GitHub consent or live repository reselection is
claimed by this administrative repair.

Execution used an OS-Temp one-shot script
`career-prd003-20261010/restore-github-installation-guarded.mjs`, with an explicit
`--apply` flag; its default is rollback. It required the effective development
configuration and exact public development APP_URL, rejected production/staging
environment labels, locked the exact historical row in a REPEATABLE READ
transaction, and checked:

- Exact tenant, user, provider, numeric account, DISCONNECTED status, NULL
  installation and historical created/updated snapshot, retaining the locked
  full-precision database timestamp for the guarded update.
- ACTIVE OWNER membership for the same user/tenant; five historical audits
  associating this connection with the installation; no globally claimed
  installation and exactly one matching account connection.
- Both deployed, valid and ready UNIQUE indexes, including the global partial
  installation constraint. Conflicts abort; no takeover/delete fallback exists.
- Exactly 10 linked resources, all DISCONNECTED, and full-row aggregate
  preservation fingerprints/counts across 18 tenant tables and all 11 other
  connections, before and after the update in the transaction. Only aggregate
  fingerprints/counts were returned; credential contents were not read into the
  script or printed. These are preservation checks, not new package hashes.

Only `installation_id` and its normal `updated_at` were changed on the connection.
All other connection fields, including ownership, status, credentials, metadata
and validation timestamp, matched their pre-update fingerprint. The transaction
appended audit `github.installation_association_restored`, ID
`3df43281-8b11-40dd-bc9d-89cb6b41635c`, recording explicit authorization and the
requirement for fresh OAuth. No resources were activated or historical analyses
executed. No production data, migrations, dependencies or security architecture
were changed.

Preserved counts include 10 resources, 11 projects and project-resource links,
82 candidate skills, 246 evidence items, 52 claims, one resume/seven sections,
14 applications, 2,143 tailored documents, 602 packages and 90 analysis snapshots.
All 18 tables and other connections passed unchanged-content checks. The
post-commit result is retained in OS Temp
`career-prd003-20261010/github-installation-restoration-result.log`.

## Reconnect, repository preservation and remaining acceptance

A new PostgreSQL/HTTP regression in
`tests/integration/github-installation-linking.test.js` exercises restoration on
a disposable fixture, fresh OAuth verification, and two authenticated repository
selection requests. It confirms reuse of the original connection ID and all ten
resource IDs, including legacy full-name resource identifiers; no duplicates;
unchanged cached analysis, creation/sync timestamps, projects, project-resource
links and candidate skill content; and zero ingestion/analysis calls during
reselection. Existing ISSUE-01 ownership, conflicting-tenant, concurrency,
rollback, durable-state and PKCE tests remain enforced. GitHub identity and
repository-list responses are fixtures, not live provider verification.

Fresh OAuth/selection intentionally rotates source evidence epochs and marks
historical evidence verification INVALID/SOURCE_REVALIDATION_REQUIRED through
the existing database triggers. The test asserts those changes and preserves
every other evidence field. Retaining evidence content does not make old receipts,
packages or approvals current. Initial test failures incorrectly expected these
security lifecycle fields to remain unchanged; only the assertions were corrected.

The four-file selected gate passed **90 tests, zero failures/cancellations/skips**:
installation-linking integration, candidate-repository-ingestion integration,
installation-service units and terminal-logging units. Existing ingestion tests
check repeated sync idempotency using controlled extraction; they do not prove
live unchanged-repository analysis can be skipped. Scoped ESLint, Prettier and
`git diff --check` passed. This is not a full repository or live OAuth acceptance
claim.

The next user action is a **new** Connect GitHub App flow at
`https://dev.aicareershub.tech/sources`, completing both callbacks on that host.
After the connection shows connected, use **Manage Repositories / Add or Remove**
to select the same ten repositories that the freshly verified installation still
authorizes, then save. Selection lists current authorized repository metadata
and relinks existing records in place; it does not rerun analysis. Removed or
unauthorized repositories must remain disconnected.

Live OAuth completion and live reselection/synchronization remain pending. Do
not replay old callback URLs or manually activate the connection/resources.
The current full `syncCandidateRepositories` path always invokes deep extraction
for each selected resource; it has no unchanged-head cache shortcut. Therefore
no bulk historical reanalysis was launched. Any required source/receipt
revalidation must respect current evidence protections; selective extraction or
a separately scoped unchanged-source revalidation mechanism may be necessary
before regenerated application packages can pass. Do not automatically restore
old evidence verification status or approval validity. Fresh package review and
approval remain required after successful regeneration.

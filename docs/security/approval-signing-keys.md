# Approval signing keys (ISSUE-05)

## Contract

`ACTION_APPROVAL_HMAC_SECRET` protects repository/GitHub action approval tickets.
`CAREER_HUB_APPROVAL_SECRET` protects application approval tickets. Both are
required in development and production. Generate **each independently** using a
CSPRNG: exactly 32 random bytes encoded as 64 hex characters or 44 canonical,
padded standard-base64 characters. Provision through the deployment secret store
or protected local environment, never source control, command-line arguments,
build artifacts, chat, logs or an example file. `.env.example` deliberately has
empty approval values and cannot start the app until configured.

Missing, empty, whitespace, malformed, obvious placeholder, repeated/low-diversity
or sequential keys are rejected. Equal decoded keys are rejected even if one is
hex and the other base64. These checks are a minimum baseline, **not proof of
entropy**; a random generator and secure provisioning remain mandatory.

`src/config/approval-secrets.js` owns the policy. The real environment schema
validates it before app bootstrap/listen; `buildApp` checks again. Both signers
also validate at use. Missing/invalid configuration throws on signing and returns
false on verification, without including supplied values in errors. No key is
generated automatically by production code and neither domain falls back to the
other, encryption/session keys or source-code constants.

Test processes may bootstrap with missing keys but cannot sign or verify with
them. `npm run test:unit`, `test:artifacts` and `test:integration` explicitly preload
`tests/setup/approval-signing-env.js`. That fixture injects named, independent,
public **test-only** keys after checking the effective post-dotenv environment is
test. Non-test environments are rejected before injection. Normal startup never
imports it. Explicit signer key overrides are allowed only in test. Direct focused
test commands need the same `--import ./tests/setup/approval-signing-env.js`, or
explicitly configured test keys. Live acceptance against a deployed application
must use securely provisioned deployment keys, not this fixture.

## Signing domains and preserved bindings

Action signatures use tenant-isolated HKDF-SHA256 with info
`antigravity:action_approval:v2`, then HMAC-SHA256 over the existing canonical
ticket fields prefixed with `antigravity:action-approval:v2`. All previous tenant,
user, candidate, resource, proposal, repository, branches, expected head, patch
fingerprint and expiry bindings are retained.

Application signatures use the independent application key and the explicit
`antigravity:application-approval:v2` prefix followed by canonical JSON. All
ISSUE-02 immutable target/context fields remain signed: approval-target format,
package ID, ticket ID, tenant, user, candidate, application, job, package version,
authoritative content hash, destination and expiry. The authoritative database
snapshot remains the only executable content. ISSUE-03 atomic consumption and
execution ownership are unchanged. No signature is accepted through a legacy
payload or legacy-key fallback. Exact 64-hex signatures and timing-safe comparison
are required.

## Historical approvals / rollout

**All pre-ISSUE-05 signatures are intentionally invalid**, including tickets whose
historical key provenance cannot be proven and tickets previously signed with a
secure key. The signing-domain version change makes this independent of operators
knowing which previous keys were used. Never re-sign historical rows to make them
trusted; require a fresh content review and new approval. No database migration or
destructive cleanup is required. Preserve historical signatures, approvals,
consumption tombstones, execution records and audit evidence.

1. Drain/stop all old instances; disable protected write traffic. Do not run mixed
   old/new signing versions. Capture backup and approval/execution state.
2. Provision two newly generated independent keys through the deployment secret
   store. Do not reuse old fallback material or test fixtures. Restrict secret
   read permissions and avoid shell tracing/environment dumps.
3. Deploy the new code/config consistently to every replica. An isolated negative
   startup probe without either key must exit before listening; repeat for invalid
   values. Inspect only variable names/status, never print values.
4. Verify both fresh approval flows with authorized staging users, each invalidated
   historical ticket, and the previous ISSUE-01–04 acceptance gates. Confirm no
   adapter/GitHub write occurs for a rejected ticket before enabling traffic.
5. Require fresh human approval for outstanding old tickets. Do not reset consumed
   statuses or create duplicate executions as a rollout/recovery shortcut.

Rollback must not restore fallback-capable binaries with protected routes enabled,
restore insecure secrets, re-sign records, or reopen spent approvals. If rollout
fails, keep writes disabled and repair configuration/deployment forward.

## Rotation

There is one active key per domain and no key ring/key-ID on persisted tickets.
The v2 prefix identifies the signing **format**, not a rotating key version.
Rotation intentionally invalidates all outstanding approvals in that domain;
users must review and approve again. No grace verification under the old key.
This fits the existing short approval TTL and avoids retaining compromised keys.

Drain protected writes/instances, provision a fresh independently generated key
for that domain consistently across all replicas, restart, verify old approvals
fail and newly issued approvals verify, then enable traffic. Keep the other key
unchanged if uncompromised. Already consumed approvals/executions must remain
spent. Rotating one domain must not invalidate the other's tickets; unit tests
exercise this and both cross-domain directions even with a deliberately shared
explicit test key. A process restart is required: signers read validated config,
not changing raw environment values on each call.

## Verification and deployment acceptance

Automated coverage uses the actual schema and real isolated app/entry-point
processes, including successful production listen, invalid startup, post-bootstrap
configuration bypass, missing test keys, explicit test setup, both signing domains,
malformed/tampered/wrong-key signatures, independent encoding checks, historical
formats, rotation and retained ISSUE-02 bindings. Previous real-PostgreSQL gates
must retain one adapter call for 50 approval contenders and one winner for each
50-caller OAuth grant race. See the execution ledger for exact results/commands.

Local proofs do not establish deployed secret-store permissions, CSPRNG provenance,
replica consistency, secret leakage by hosting infrastructure, or successful live
GitHub/employer integration. Coordinated staging/deployment acceptance is required.

## Separate inventory finding (not remediated here)

The full signing-path inventory also found `S3StorageProvider` defaults its secret
access key to an empty string and can locally generate a SigV4 header without
credentials (`src/storage/s3-storage.provider.js`, constructor/signRequest). This
is an independent fail-closed configuration concern, not an approval forgery
path; no claim is made that a real S3 service accepts such a request. It is outside
ISSUE-05 and remains unchanged. Session CSRF, GitHub installation state, GitHub
App JWT and webhook verification paths do not select public fallback signing keys
in the inspected code. No unrelated security remediation is included.

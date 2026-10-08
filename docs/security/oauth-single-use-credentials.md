# ISSUE-04: Single-use OAuth credentials

## Scope and evidence

Only authorization-code redemption, refresh rotation and the revocation paths
that can race them were changed. ISSUE-01/02/03 remain intact. ISSUE-05 signing
fallback remains open. Local PostgreSQL verification is not staging acceptance.

Before product edits, two separate pools/services were forced to finish their
real PostgreSQL lookups before either continued (a barrier around the completed
SELECT, not a fake database). The original unconditional updates produced:

| Flow | Callers | Successful responses | Access rows issued | Refresh successors issued |
| --- | ---: | ---: | ---: | ---: |
| Code redemption | 2 | 2 | 2 | 2 initial refresh tokens |
| Refresh rotation | 2 | 2 | 2 | 2 |

Evidence: `%TEMP%/issue04-original-races.log` and
`%TEMP%/issue04-original-refresh-race.log`. The first exploratory refresh row
count used the wrong family from an unordered query; the corrected reproduction
looked up the exact presented refresh hash and confirmed two successors. No
external OAuth client or employer was contacted.

## State machines and policy

- Code: ISSUED (`is_consumed=false`, not expired) -> CONSUMED, in the same
  transaction as both token hashes and the redemption audit. Expired, invalid,
  wrong-client/redirect/PKCE/resource and inactive/foreign-context grants do not
  issue tokens. Failed validation never consumes an otherwise usable code.
- Refresh: ACTIVE -> ROTATED (`rotated_at`, `is_revoked=true`), with exactly one
  successor referencing `predecessor_id`. Rotation also revokes the old access
  token, preserving the existing paired-token policy.
- Explicit revocation/replay: all family members -> REVOKED, with durable
  `family_revoked_at`. Expiration is checked against PostgreSQL's current clock
  after waiting for locks; it is not a new persisted status.
- Replay is a presentation of a previously rotated/revoked member. Bearer
  credentials cannot distinguish an innocent duplicate from theft. Preserve the
  existing strict policy: revoke the entire family and require reauthorization,
  with no grace window, successor recovery or second issuance. Consequently a
  concurrent refresh loser invalidates the winning pair too. This is deliberate
  fail-closed behavior, not a promise that the winner remains usable afterward.
- The policy follows [RFC 9700 section 4.14.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2).
  Authorization-code rejection uses `invalid_grant` as defined in
  [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html#section-5.2).

## Database exclusivity and atomicity

Code redemption performs a client/hash-bound SELECT FOR UPDATE, validates the
locked row and stored user/tenant ownership, then uses:

```sql
UPDATE oauth_authorization_codes
SET is_consumed = true, consumed_at = :now
WHERE id = :id AND is_consumed = false
  AND expires_at > clock_timestamp()
RETURNING id;
```

Code consumption, a root token pair referencing `authorization_code_id`, and
`oauth.code.redeemed` commit together. Both token hashes already share ONE row;
there is no separate access-token/refresh-token persistence window. No raw
credentials are returned before the transaction promise acknowledges COMMIT.

Rotation first resolves the immutable family identity using client + refresh
hash, acquires a PostgreSQL transaction-scoped family lock, then re-reads the
token FOR UPDATE. The stale initial read is never used for active-state checks:

```sql
SELECT pg_advisory_xact_lock(hashtextextended(:family_id, 0));
-- Re-read token FOR UPDATE, validate bindings/expiry and clamp scopes.
UPDATE oauth_tokens
SET is_revoked = true, revoked_at = :now, rotated_at = :now
WHERE id = :id AND is_revoked = false
  AND rotated_at IS NULL AND family_revoked_at IS NULL
  AND refresh_token_expires_at > clock_timestamp()
RETURNING id;
-- INSERT successor pair with predecessor_id and SAME family/context/resource.
-- INSERT rotation security event, then COMMIT.
```

The lock is in PostgreSQL, shared across pools, services and OS processes, not a
JavaScript mutex. Hash collisions only serialize unrelated families. Family-wide
locking is necessary: locking R1 alone cannot serialize replay of R1 against
rotation of R2. Refresh revocation and provider disconnect acquire the same
family lock, so they cannot miss a successor inserted by an in-flight rotation.

Independent unique indexes enforce one root per authorization code, one successor
per predecessor, and at most one unrevoked token pair per family. Successor is
discoverable by its unique predecessor reference; no separate session table is
needed. Existing family UUIDs are retained.

Replay/family revocation/security audit commit before the service throws the
OAuth rejection. Throwing inside that transaction would incorrectly roll back
revocation. Audit failure instead fails issuance/rotation closed; it never
reopens a consumed grant. Events contain internal IDs and client/family IDs, not
raw codes/tokens/verifiers/secrets. Unknown database errors receive HTTP 503
`temporarily_unavailable`, without database diagnostics in the response/log event.

Scopes can narrow but never expand; role ceilings are reapplied. Resource,
client, user and tenant come from the authoritative grant. Client-supplied
user/tenant hints cannot become token identity. Client registration and client
authentication mechanisms are not redesigned in ISSUE-04; the exercised client
flows are the existing public-client PKCE paths. The registry's lack of
confidential-client secret storage/authentication remains outside this fix.

## Failure and recovery matrix

| Failure point | Durable result | Same-credential retry |
| --- | --- | --- |
| Before lock/validation or failed validation | No new pair; grant unchanged | Only if still valid and correct bindings supplied |
| Consume/rotate write, pair insertion or critical audit fails | Entire transaction rolled back | Safe after rollback is confirmed |
| PostgreSQL rejects COMMIT | No consumption/successor survives | Safe after rollback is confirmed |
| Process dies before COMMIT | PostgreSQL aborts the transaction and releases locks | Safe once abort is confirmed |
| COMMIT succeeds but response/acknowledgement is lost | Code spent or refresh rotated; pair exists but may be unknown to client | Do not assume rollback; restart authorization |
| Process dies after COMMIT | Durable consumed/rotated state survives restart | No new lineage; refresh replay revokes family |
| Duplicate code request | `invalid_grant`; one original pair only | No |
| Duplicate refresh/old family member | `invalid_grant`; family revoked | No; fresh consent required |

There is no internal automatic retry on database/commit errors and no credential
response cache. PostgreSQL is the only side-effect boundary in these two grants;
there is no external provider HTTP call inside either transaction. An OAuth
client timeout is not evidence of rollback.

## Migration and rollout

Journaled migration `0020_atomic_oauth_credentials.sql` adds nullable source code
and predecessor FKs, rotation/family-revocation timestamps and three unique
indexes. Historical token/code/audit rows are retained. Legacy branching cannot
be reconstructed safely: revoke ALL existing OAuth pairs and consume outstanding
pre-upgrade codes, forcing fresh consent. This affects MCP OAuth sessions, not
personal MCP API tokens or GitHub installation credentials.

1. Disable token issuance/refresh and stop ALL old application instances.
2. Back up the database; rehearse upgrade on a disposable/staging database.
3. Apply the complete journal with `node src/db/migrate.js`.
4. Deploy the patched instances together and request fresh client consent.
5. Verify PKCE -> token -> MCP and refresh -> MCP across deployed instances.

Do not mixed-version roll out: old code omits lineage and uses unsafe independent
writes. Do not roll back to the vulnerable service while token endpoints are
enabled. Emergency rollback means disabling those endpoints; retain consumed,
rotated, revoked and audit history. Prefer roll-forward. A schema-only rollback
is mechanically possible (drop the three new indexes and four added columns),
but loses lineage evidence and does NOT restore old credentials safely; restore
neither active legacy flags nor consumed codes. Restore a backup only into an
isolated investigation database, never to reopen already-spent credentials.

Fresh migration, upgrade from migration 0019 with a deliberately branched legacy
family, repeated journal application and actual unique-index inspection were
verified on PostgreSQL 17.4. The two legacy rows were preserved and revoked, and
the outstanding code consumed. Evidence: `%TEMP%/issue04-migration.log`.
An isolated transactional DDL rollback rehearsal removed the added columns/indexes,
confirmed historical revoked rows survived, and rolled back the DDL to restore
all three indexes and both tombstones (`%TEMP%/issue04-rollback-rehearsal.log`).
This is not a tested or authorized rollback to the vulnerable application binary.

## Local acceptance tests

`tests/integration/oauth-credential-concurrency.test.js` contains 68 tests:

- 2/10/50 callers for each credential, all separate service objects and pools.
- Two independent Node processes for each credential; real row-lock contention.
- Sequential/restarted-pool replay, wrong client, resource and persisted tenant,
  expired/missing credentials, inactive users and expiry after lock waiting.
- Wrong PKCE/redirect does not burn the code; scope escalation rejected, narrowing
  and role demotion retained; client identity hints cannot override stored context.
- Nine injected transaction boundaries per grant, real deferred-COMMIT rejection,
  and hard child-process termination before/after COMMIT for both grants.
- R1 -> R2 -> R3 replay of R1/R2, replay racing successor rotation, explicit and
  provider revocation, exact database uniqueness violations and redacted events.
- MCP bearer context before/after rotation, old access invalidation, safe HTTP
  protocol/database errors and refresh-scope forwarding.

Selected local acceptance and remaining live/baseline limitations are recorded
in `project.md`. Never interpret these tests as a green full-repository suite or
real Claude/ChatGPT/GitHub staging acceptance.

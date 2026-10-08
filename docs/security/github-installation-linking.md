# ISSUE-01: secure GitHub installation claiming

## Root cause and authority policy

The old flow authenticated a platform session, signed user/tenant state, received
an installation ID, fetched `/app/installations/{id}` with an App JWT, and wrote
a connection. App visibility proves only that the installation belongs to the
App. It does not prove that the requesting GitHub user can claim it. The old
`setup_action=update` branch also accepted callbacks without state, cookie
deletion did not prevent replay, and check-then-insert did not arbitrate races.

The login OAuth App token is not reused for App installation authority. A separate
GitHub App authorization-code exchange with S256 PKCE obtains a short-lived user
access token. `/user` must return the same numeric GitHub ID recorded in the
authenticated login session. `/user/installations` must contain the exact installation.
App JWT verification is a second lifecycle/permission check, never a fallback.

Personal policy: the installation account's numeric ID must equal the user ID.
Organization policy: the user must have access to the installation AND
`/user/memberships/orgs/{org}` must return active `admin` membership (organization
owner), with the exact organization numeric ID. A repository collaborator may
see an installation but cannot claim it: installation tokens could expose more
repositories than that collaborator can access. Unknown account types fail closed.

Official API references:

- [GitHub App user authorization and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Installations accessible to the user](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token)
- [Authenticated user's organization membership](https://docs.github.com/en/rest/orgs/members#get-an-organization-membership-for-the-authenticated-user)

## Corrected flow

1. Login verifies the GitHub numeric subject and records `sessions.github_user_id`.
   Older sessions have NULL and must log in again; no email/username backfill.
2. `/integrations/github/install` requires a session and OWNER or MEMBER role.
   HMAC-signed state binds user, tenant, session, GitHub subject, phase, callback,
   256-bit nonce and 10-minute expiration. A SHA-256 hash is persisted server-side.
3. GitHub returns to `/integrations/github/install/callback`. Both install and
   update require matching state/cookie. An atomic DELETE consumes initial state;
   the transaction issues new state bound to the exact returned installation ID.
   No connection exists at this point. Pending `setup_action=request` is not linking.
4. Redirect to App user authorization with the configured App client ID, fixed
   callback URL and S256 PKCE challenge. The verifier is encrypted in PostgreSQL.
5. `/integrations/github/authorize/callback` validates all context and any supplied
   installation ID, then consumes the authorization state BEFORE GitHub calls.
   Replays, including after GitHub/claim failure, require a fresh flow.
6. Exchange code, verify numeric user ID, exact user-accessible installation,
   personal/org ownership policy, App identity, suspension and required permissions.
   Tokens and refresh tokens are not persisted. Network, response, pagination-cap,
   permission and membership failures deny linking without fallback.
7. A transaction inserts the connection with `ON CONFLICT DO NOTHING`, arbitrated
   by the global unique installation index. A same-tenant conflict locks the row
   and permits an authorized reconnect. Another tenant receives HTTP 409 `CONFLICT`
   with reason `INSTALLATION_ALREADY_LINKED`; ownership is never overwritten.
   Connection and success audit write commit or roll back together. State remains
   consumed even on claim failure. Cache eviction follows commit.

Production state cookies are `__Host-gh_install_state`, `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/`, no Domain, with a 600-second lifetime. Database TLS does
not determine browser cookie security. Production never reads the development
state cookie as fallback. Expired state is rejected and cleaned on later initiation;
session/user/tenant deletion also cascades state removal.

## Database migration and rollout

Migration: `0018_secure_github_installation_claims.sql`, journal entry 18.

- Global partial UNIQUE index on `resource_connections(installation_id)` for
  non-null GITHUB_APP installations, including disconnected/revoked rows.
- Nullable verified login subject on sessions, without guessing historical identity.
- Durable state table, lifecycle/phase constraints, cascading foreign keys and
  session/user/tenant/expiration indexes.
- Historical duplicates intentionally fail migration. No automatic owner selection,
  merging, transfer, or deletion is safe. Resolve through incident review first.

Before rollout, inspect duplicate IDs and existing GitHub claims. Previously
linked installations have NOT retroactively been authorized by this patch; review
their evidence and require reconnection or disconnect suspect claims before release.
Installation ownership stays reserved on disconnect; transfer is not implemented.

Stop/drain old application instances before applying migration and starting the
new code. The index protects races from old writers, but old binaries still have
the authority vulnerability. Do not run a mixed-version installation endpoint.
Apply with `npm run db:migrate`; restart clears process-local installation caches.
Do not use schema push as a substitute for the migration.

Rollback application behavior by disabling installation setup, not by restoring the
vulnerable binary. Schema expansion is compatible with old readers, but that does
not make the old write path safe. If full schema rollback is necessary, keep the
endpoint disabled, preserve ownership/audit records, drop the new state table and
session column, and drop the unique index only after independently safeguarding
all installation writes. No destructive down migration is automatically run.

## GitHub registration and manual staging verification

- Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`,
  `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, encryption key and public
  HTTPS `APP_URL`. App credentials must all refer to the same registered App.
- Setup URL: `<APP_URL>/integrations/github/install/callback`.
- User authorization Callback URL: `<APP_URL>/integrations/github/authorize/callback`.
  Disable automatic "Request user authorization (OAuth) during installation";
  this server explicitly starts the bound PKCE authorization step.
- Keep repository contents/metadata read permissions; grant organization Members
  read permission for org ownership checks. Missing permission is a denial, not a bypass.
- Fresh login, personal install, organization-owner install, ordinary-member denial,
  existing-install reconnect, browser-account switch, expired/replayed callback,
  revocation/suspension/deletion and real GitHub outages need staging validation.
- Inspect actual HTTPS browser cookie acceptance and both redirect URLs. Confirm
  consent and Members permission behavior under the organization's SSO/App policy.

Local tests mock only GitHub HTTP. PostgreSQL uniqueness, transactions, replay
consumption, claim races, login-session subject and Fastify routing run locally.
Real GitHub permissions/consent behavior remains external verification, not a local PASS.
Authority is checked at claim time; continuous organization-role monitoring and
previously ingested data incident response are outside this installation-linking fix.

## Automated test inventory (72 cases)

These replace the earlier 33 installation tests (net +39 cases), with an additional
verified-login-subject assertion in the existing authentication integration test.
All 72 below passed locally; GitHub HTTP is mocked, PostgreSQL and Fastify are real.

1. migration expands schema and preserves the existing installation row
2. migration rejects historical duplicate claims atomically without choosing or deleting an owner
3. legitimate personal owner links using numeric ID despite a changed username; encrypted metadata and audit persist
4. active organization owner can claim an accessible organization installation
5. authorized reconnect updates the existing row, not a second owner; disconnected credentials are refreshed explicitly
6. rejects attacker knows victim ID
7. rejects foreign unclaimed personal installation
8. rejects App-visible but not user-accessible installation
9. foreign already-claimed installation remains with its original tenant
10. rejects ordinary organization member
11. rejects pending organization owner
12. rejects membership for another organization
13. inaccessible organization (403) fails closed without an App fallback
14. GitHub user OAuth must match the numeric identity verified at login, not the same login/email text
15. state attack: missing state cannot create a connection
16. state attack: invalid state cannot create a connection
17. state attack: missing cookie cannot create a connection
18. state attack: cookie mismatch cannot create a connection
19. state attack: another user cannot create a connection
20. state attack: another tenant cannot create a connection
21. state attack: installation mismatch cannot create a connection
22. state attack: another session cannot create a connection
23. expired durable state fails even with a still correctly signed cookie
24. install state can transition only once and cannot be rebound to a different installation
25. OAuth state replay is rejected before further GitHub requests
26. simultaneous callbacks with the same state execute authority checks only once
27. fails closed: revoked user authorization; state is burned
28. fails closed: revoked installation; state is burned
29. fails closed: deleted installation; state is burned
30. fails closed: GitHub unavailable; state is burned
31. fails closed: GitHub network error; state is burned
32. fails closed: invalid JSON; state is burned
33. fails closed: invalid installation list; state is burned
34. fails closed: OAuth error with HTTP 200; state is burned
35. fails closed: login OAuth token used instead of App user token; state is burned
36. fails closed: suspended installation; state is burned
37. fails closed: mismatched App response; state is burned
38. fails closed: App and user account disagreement; state is burned
39. fails closed: insufficient installation permissions; state is burned
40. pagination finds an authorized installation after the first page
41. two authorized tenants racing for the same organization yield exactly one owner and one deterministic rejection
42. an already-claimed installation rejects another authorized org owner without replacing the tenant
43. global unique index rejects direct competing inserts independently of service checks
44. a database/audit transaction failure rolls back the connection and cannot replay authorization
45. failure to consume state in the database prevents GitHub verification and linking
46. a validly signed but never-issued state cannot bypass the durable state store
47. HTTP route requires session, state and two callbacks with exact PKCE binding
48. accepts signed session/user/tenant/identity/callback/installation context
49. rejects missing state
50. rejects missing cookie
51. rejects mismatched cookie
52. rejects invalid signature
53. rejects expired state
54. rejects invalid expiry
55. rejects another user
56. rejects another tenant
57. rejects another session
58. rejects another GitHub identity
59. rejects another callback
60. rejects wrong phase
61. rejects legacy sessions instead of comparing usernames or email
62. rejects READONLY and unknown roles
63. legacy direct link and update methods cannot bypass OAuth
64. missing App user credentials fail closed
65. App visibility alone returns data but never writes a connection
66. rejects suspended App installation responses
67. rejects wrong installation ID App installation responses
68. rejects wrong App ID App installation responses
69. rejects missing account App installation responses
70. rejects missing suspension field App installation responses
71. rejects missing contents permission App installation responses
72. production cookie satisfies __Host requirements independently of database TLS

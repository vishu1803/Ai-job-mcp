# ISSUE-08: explicit proxy trust and client identity

## Contract and scope

Local implementation only. Production remains NO-GO; no deployed ingress addresses or live staging acceptance were established. Cloudflare Tunnel and Heroku documents describe possible topologies, not authoritative current networking. No production/staging data or credentials were accessed.

`TRUSTED_PROXY_CIDRS` is a comma-separated list of explicit IPv4/IPv6 IPs or nonzero numeric CIDRs. Default unset/empty/whitespace: **no forwarding trust**, including production. Missing production proxy config is accepted in safe socket-only mode; multiple clients behind an unconfigured ingress share its throttle bucket. This may reduce availability but cannot silently enable all-hop trust.

Synthetic format example, NOT a deployment default: `192.0.2.10/32,2001:db8:1234::/64`. Operators must provide real, narrow ingress ranges. Plain IPs mean /32 or /128. Host bits are masked, equivalent forms/duplicates collapse and lists sort canonically. Up to 128 entries. `true`, `*`, hop counts, functions, names (`loopback`, `uniquelocal`), hostname lookups, netmask notation, zero prefixes, ports, zone IDs, shorthand/octal IPv4, empty list members and malformed IPs/prefixes fail validation. Mapped IPv6 IPs normalize to IPv4; mapped CIDRs require /97–/128 and normalize to the corresponding nonzero IPv4 prefix. No native IPv6 range is matched against IPv4 accidentally.

Environment validation runs after dotenv loading. `buildApp` revalidates configuration and any programmatic `trustProxy` override; only explicit IP/list/CIDR or false/empty is permitted. Broad booleans, hop counts and caller-provided trust functions cannot override the policy. Same contract applies in development, test, staging (`APP_ENV`) and production; NODE_ENV does not grant trust. Configuration changes require restarting every replica.

## Algorithm and identity domains

Fastify is constructed with a network predicate, never trust-all. Its installed implementation uses **@fastify/proxy-addr**, distinct from the recently patched unscoped proxy-addr. Before route/security hooks, the application establishes canonical `request.ip`, `request.ips` and `request.peerIp` from the actual TCP socket and validated XFF. Addresses walk right-to-left from socket toward client and stop at the nearest untrusted hop; arbitrary leftmost addresses cannot cross that boundary. Strict parsing handles all hops; missing/invalid data or chains over 32 entries/4096 characters conservatively use the peer. No valid peer means the bounded `unknown` bucket, never unlimited requests.

CF-Connecting-IP, X-Real-IP and Forwarded have **no independent identity authority**, even behind a trusted peer. If a provider uses them, a verified ingress must convert its authenticated source to a sanitized XFF. An IP differing from socket identity is not proof of proxy authority.

| Path / sanitized XFF                                             | Effective identity |
| ---------------------------------------------------------------- | ------------------ |
| Direct or unknown peer, any headers                              | Socket peer        |
| Trusted peer, no/invalid XFF                                     | Socket peer        |
| Trusted peer; `client`                                           | client             |
| Trusted B; `client, trusted A`                                   | client             |
| Trusted B; `spoof, untrusted U, trusted A`                       | U                  |
| Trusted ingress appends actual untrusted client; `spoof, client` | client             |

Resolved IP is abuse-control/audit metadata, **not authentication**. User, tenant, token scopes and approvals continue to come from authoritative credentials/database state. Native IPv6 canonicalizes; IPv4 and hexadecimal/dotted mapped IPv6 share the same IPv4 bucket. No speculative subnet aggregation was introduced.

## Controls and logging

- Auth routes: login initiation, signup and password login use `checkAuthLimit` and canonical extracted IP. GitHub callbacks still rely on existing state/PKCE/session logic; this task does not add unrelated throttles.
- MCP: pre-auth IP checks then independent token, tenant, tool-cost and concurrency controls; bearer authentication clientInfo now uses the same helper, with no raw-XFF fallback.
- Webhooks: IP abuse limit remains separate from HMAC delivery authorization.
- Web generation/upload/assistant limits retain existing tenant/user keys; IP fallback uses canonical request identity. Application approval/execution authority remains durable database identity, never IP.
- OAuth exchange/refresh audit events, candidate/account/connection/integration audits use canonical request.ip. Existing OAuth PKCE, binding/rotation and tenant checks are unchanged; this task does not add new OAuth rate-limiter features.
- Safe request logs retain `remoteAddress` as resolved identity plus `peerAddress` as direct peer. Serializer resolves independently even before onRequest; no raw forwarding headers are stored. Missing identity cannot disable IP/auth limit checks.

Rate limiting is **per-process memory**, not a shared PostgreSQL/Redis store. Two replicas do not share a global quota; restart resets quota. Local multi-instance tests prove the trust policy, not distributed limiting. Existing fail-open internal limiter errors/LRU eviction are not redesigned in this task. Independent edge/distributed limits remain release hardening requirements.

Direct raw forwarded-host/proto consumers in auth/OAuth/MCP public-URL helpers remain a separately scoped URL/origin perimeter review (ISSUE-12); they do not supply IP/tenant/approval identity. This task does not claim those URL boundaries closed. Fastify's own host/protocol getters use the explicit immediate-peer predicate.

## Operator deployment procedure

1. Inventory each route from internet to app, including alternate shorter paths, tunnel agent, ingress/LB, container bridge, sidecars and direct access. Obtain actual socket peers from sanitized `peerAddress` logs or restricted diagnostic traffic. Match them against authenticated infrastructure/network inventory; forwarded headers are NOT evidence of a trusted peer.
2. Default to empty config until that evidence exists. Never automatically trust all private/loopback networks. A loopback tunnel can be trusted only when local processes/ports are controlled and that peer cannot be reached by an untrusted user. A private container range may contain attacker-controlled workloads: prefer exact ingress addresses or a dedicated isolated subnet.
3. Restrict origin access with firewall/security groups/network policy to intended ingress sources. Prevent direct alternate routes through an allowlisted address. Protect ingress administration and do not expose diagnostic routes.
4. At the edge, discard client-supplied forwarding headers and set XFF from authenticated network identity. Interior proxies append their actual connecting peer. If a vendor preserves incoming XFF, prove it appends the true peer and configure every trusted upstream hop; otherwise use a sanitizing ingress. Strip alternative IP headers or ignore them. Never blindly copy CF-Connecting-IP from an untrusted request.
5. Set the smallest verified IPs/CIDRs. No provider ranges are hardcoded. For changing LB addresses use provider-authenticated inventory, reviewed updates and atomic/restart deployment; temporary unknown peers fall back to socket identity, not wildcard trust. Prefer stable dedicated ingress networking when provider boundaries cannot be represented safely.
6. Drain old trust-all workers. Deploy identical canonical lists to every replica, validate loaded non-secret lists, then prove real ingress routing. Do not mix vulnerable workers into acceptance traffic. CI only proves local behavior; hosted workflow execution/protection still requires acceptance.
7. Rollback by disabling forwarding trust (empty list), retaining current code/security fixes. Do NOT restore trust-all, legacy keys, old tokens/approvals or unsupported evidence. Socket-only mode can aggregate clients and throttle traffic; monitor and repair topology rather than weakening policy.

## Staging acceptance (currently BLOCKED)

Provision an isolated healthy staging endpoint, verified ingress/network inventory, disposable users/repos/MCP OAuth clients, mock/non-submitting adapters, replica routing and log access. No healthy isolated staging evidence is available; historical endpoint failures and operator notes are not current acceptance.

- Through real ingress, rotate XFF/CF/X-Real-IP/Forwarded while keeping one true client. Confirm resolved identity/logs/bucket are unchanged and 429 occurs at the configured threshold.
- Attempt direct origin and alternate-length paths: firewall rejects or socket identity applies.
- Validate trusted A/B, unknown U and spoofed leftmost chains, IPv4/IPv6/mapped forms, missing/malformed headers and edge sanitization.
- Compare canonical config and peer/resolved logs on every replica; independently confirm per-replica versus shared quota behavior. A global quota requires a separately scoped shared limiter.
- Verify real login/state/PKCE, OAuth exchange/refresh, MCP bearer/scopes/resources/tools, tenant isolation, extension and approval workflows. Use mock employer adapters only.
- Run ISSUE-01–06/13 and dependency audit acceptance without revealing tokens, cookies or secrets. Do not deploy to production or submit actual applications.

## Local evidence

Before edits, pre-ISSUE-08 application in a frozen patched-dependency Temp tree was run with its production-equivalent `trustProxy:true` setting over actual loopback TCP. Five requests with limit2 produced login `[302,302,302,302,302]` and five auth buckets. MCP `[401,401,401,401,401]` produced five pre-auth buckets. Socket127.0.0.1 stayed constant, request.ip followed rotating203.0.113.x and the helper independently selected rotating198.51.100.x CF headers. Initial incorrectly named auth mock returned500, still five buckets; corrected `startOAuthFlow` mock proved the302 bypass. No real GitHub calls or user data.

After patch, actual application HTTP acceptance asserts login `[302,302,429,429,429]`, MCP `[401,401,429,429,429]`, one bucket for all four header-rotation attacks, canonical log identity, nearest-untrusted chains, malformed chains, real IPv6 TCP, mapped CIDRs and independent tenant buckets. Explicit fixture networks in older tests replace unsafe wildcard setup; incompatible CF precedence is intentionally rejected, not restored.

No migration or new dependency is required. No live proxy/GitHub/provider acceptance or distributed quota guarantee is implied. Final commands/results and retained baseline release blockers are recorded in project.md.

### Final local gates

| Selection                                                                        | Unique PASS | FAIL | SKIP | CANCEL |
| -------------------------------------------------------------------------------- | ----------: | ---: | ---: | -----: |
| New ISSUE-08 policy/bootstrap/real-HTTP tests                                    |          84 |    0 |    0 |      0 |
| Existing broader auth/MCP/OAuth/extension/log/config/rate/dependency/audit tests |         297 |    0 |    0 |      0 |
| Selected ISSUE-01–06 PostgreSQL/security tests                                   |         576 |    0 |    0 |      0 |
| Total                                                                            |         957 |    0 |    0 |      0 |

Run with Node22.23.3/npm11.6.2 in the frozen patched-dependency Temp checkout, explicit synthetic ENV_FILE and signing-key preload. New focused command:

```sh
node --import ./tests/setup/approval-signing-env.js --test --test-concurrency=1 --test-timeout=60000 tests/unit/proxy-policy.test.js tests/integration/proxy-trust-security.test.js
```

Broader gate uses the same preload, concurrency1 and timeout120000. Files: the two new tests; unit extract-client-ip, logger, env-config, application-rate-limiter, web-rate-limiting, mcp-auth, oauth-state, oauth-routes-redirect, webhook-signature, github-webhook, dependency-security-compatibility, dependency-auditor and dependency-audit-fail-closed; integration staging-proxy-security, mcp-server, mcp-conformance-and-resources, oauth-seamless-ux, extension-api, extension-matrix and mcp-apps-extension. Final broad log380 includes83 focused tests from before the final dotenv test addition; final focused84 overlaps those83, hence297 other unique tests. Repeats are excluded.

P0 gate uses the same preload/concurrency/timeout: unit github-installation-service, oauth-authorization-server, approval-signing-security, evidence-verification-security and narrative-trust-boundary; integration github-installation-linking, application-approval-content-binding, application-approval-execution, oauth-credential-concurrency, approval-signing-startup, evidence-verification-security and historical-artifact-quarantine.576 PASS, including real-PG50-caller approval/OAuth tests and separate-process tests.

Retained logs in OS Temp: issue08-focused-final2.log, issue08-broad-final2.log and issue08-p0-final2.log. Final issue08-focused-final2 contains the post-dotenv override test. One initial test-cleanup hook error (passing TestContext as a database pool) was corrected; initial failure is not counted as a passing run. New tests do not depend on a live registry or external credentials.

Audit registry access initially failed under restricted network and correctly reported ERROR. Authorized registry checks then completed: default exit0/PASS with0 critical/0 high/6 moderate; strict exit1/FAIL. Patched versions and lock bytes preserved; npm ls --all exit0. Migration journal/drift/lifecycle checks PASS. Static schema-integrity FAIL has four unchanged findings; pre-ISSUE-08/current output hashes are identical. Modified JS lint/syntax and code/CI/new-doc formatting PASS; strict scoped scan9 current/9 HEAD synthetic matches/0 introduced. No hosted or live acceptance is claimed.

Framework reference: [Fastify trustProxy documentation](https://fastify.dev/docs/latest/Reference/Server/#trustproxy) warns that forwarding headers are spoofable without trusted proxies; exact installed request/proxy implementation was also inspected.

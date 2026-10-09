# Critical/high dependency advisory remediation

Date: 2026-10-09. Scope: compatible dependency resolutions following ISSUE-13.
No production deployment, dependency suppression, application trust-policy change or database migration.
Production remains **NO-GO**. Hosted CI and ISSUE-01–06 staging acceptance remain outstanding.

## Authoritative baseline and transition

Read the project controls, ISSUE-13 contract and integrated acceptance report. The current phase is P0 security acceptance, not a new product phase. Existing workspace node_modules is not release evidence.

Copied current source/tests and unchanged manifests into an isolated OS-Temp checkout, excluding private environment files, stored user artifacts, credentials and browser profiles. Frozen baseline `npm ci --ignore-scripts --no-audit` succeeded (331 packages). Raw `npm audit --json`, `npm run audit:deps`, and `npm run audit:deps -- --strict` all exited1 with1 critical/2 high/6 moderate vulnerable package entries. Nine distinct GHSA IDs comprised1 critical/3 high/5 moderate.

Runtime contract remains package.json Node>=20 and .nvmrc/CI Node22. The initial baseline used existing Node24.13.0/npm11.6.2; an isolated Node22.23.3/npm11.6.2 toolchain then exercised the patched tree and reproduced baseline failures. No installed runtime was switched. A temporary npm-shim path error was corrected; its failed commands were not counted as completed audits.

Targeted normal npm command:

```sh
npm update @modelcontextprotocol/sdk proxy-addr brace-expansion --package-lock-only --ignore-scripts --no-audit
```

It refreshed three compatible resolutions without changing package.json or adding overrides. Registry-generated integrity hashes were retained. Workspace lockfile exactly matches the tested candidate. Four redundant nested fast-uri3.1.8 copies were deduplicated to the existing root3.1.8; no package family was removed. Direct dependency versions, MCP v2 server/core/ext-apps packages and application source were unchanged.

## Fixed advisory inventory and exposure

| Package                   | Locked before → installed after | Parent chain / supported range                                                         | Advisory / affected range                                                                                                                                                                                                                                                     | Exposure assessment                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| proxy-addr                | 2.0.7 →2.0.8                    | @google/genai2.18.0 or ext-apps1.7.5 → peer SDK → express5.2.1; express accepts ^2.0.7 | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), CRITICAL; >=1.1.0 <2.0.8                                                                                                                                                                            | **Exposure demonstrated at dependency-function level**: short IPv4-mapped IPv6 trust subnet incorrectly trusts foreign IPv4 before, rejects after. Application exposure is **Unknown**: this app uses Fastify's separate @fastify/proxy-addr5.1.0, not Express proxy-addr for its main perimeter.             |
| @modelcontextprotocol/sdk | 1.30.0 →1.32.1                  | @google/genai optional peer ^1.25.2; ext-apps peer ^1.29.0; both support1.32.1         | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h), HIGH; >=1.12.0 <1.31.0                                                                                                                                                                              | **Not reachable under tested server-only conditions**; broader deployment exposure **Unknown**. No application OAuthClientProvider/direct v1 OAuth-client invocation was found; GenAI adapters use model generation, not mcpToTool. The patched helper rejects foreign issuer-bound credentials before fetch. |
| brace-expansion           | 1.1.18 →1.1.21                  | eslint9.39.5 → minimatch3.1.5 → ^1.1.7                                                 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), HIGH; <1.1.20; [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), HIGH; <1.1.19; [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), MODERATE; <1.1.21 | **Potentially reachable** through lint/tooling patterns; application-specific attacker input path **Unknown**. Ordinary globs and bounded hostile nesting/chaining/rewrite inputs pass.                                                                                                                       |

All three updated packages are transitive. No direct imports of proxy-addr or brace-expansion occur in application source. The other brace-expansion copy,5.0.12 through @fastify/static→glob13→minimatch10, was already patched and unchanged. Compatibility tests enforce branch-specific brace patch floors, not just a global version comparison.

### MCP scope and residual client risk

The main platform uses **@modelcontextprotocol/server v2**, not the updated monolithic v1 SDK as its request handler. The v2 server/core and ext-apps versions remain unchanged. Existing application bearer authentication, scopes, tenancy, request validation, rate/concurrency controls and cleanup were not replaced by SDK defaults.

Tested patched v1 imports, initialization, tool registration/invocation, malformed tool arguments, resource reads and teardown through linked transports. Tested issuer-bound OAuth helper success, foreign issuer rejection without fetch and cross-origin token redirect rejection without following it. Existing v2 HTTP/auth/OAuth/resource/extension tests supply separate application compatibility evidence.

The upstream fix is **not** sufficient for unstamped historical client credentials, bundled providers without expectedIssuer, or direct lower-level exchangeAuthorization/refreshAuthorization use. No such application path was found here. Any external client/operator using them must clear or bind historical credentials, preserve issuer metadata and configure a trusted expected issuer; rotate credentials if an untrusted-server connection may have occurred. This is not a claim to have tested external clients.

### Proxy scope

Compatibility coverage includes IPv4, mapped IPv4, native IPv6, short mapped subnet attack, trusted/untrusted forwarding chains, direct sockets, malformed headers and stable rate-limit identity. Actual main-app proxy/perimeter tests also pass. Invalid forwarding headers on an explicitly untrusted socket cannot override its identity; this does not certify arbitrary malformed headers behind a trusted proxy.

**ISSUE-08 remains open.** src/app.js still enables trustProxy=true in production; this task does not establish a safe deployment trust boundary or change it. **ISSUE-12 remains open**; updating the SDK does not replace application Origin policy review.

## Clean install and audit results

Patched clean installs succeeded with327 packages, including two Node22 installs with normal lifecycle scripts. `npm ls --all --json` exited0: no invalid/missing required peers. Optional platform-specific packages are not all expected on Windows. package.json remains unchanged and the lockfile bytes are stable. No major upgrade/downgrade or audit fix --force was used.

| Metric                              | Before | After |
| ----------------------------------- | -----: | ----: |
| Critical vulnerable package entries |      1 |     0 |
| High vulnerable package entries     |      2 |     0 |
| Moderate vulnerable package entries |      6 |     6 |
| Unique GHSA IDs                     |      9 |     4 |
| Raw npm audit exit                  |      1 |     1 |
| Default wrapper exit                |      1 |     0 |
| Strict wrapper exit                 |      1 |     1 |

Default PASS means HIGH/CRITICAL policy-clean, **not vulnerability-free**. Strict FAIL remains intentional. ERROR remains exit2; ISSUE-13 parser/process tests verify fail-closed behavior. Neither the audit wrapper nor its policy was changed.

## Remaining moderate advisories

| Package / installed version | Chain                                                                                | Advisory / affected range / patch                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| esbuild0.18.20              | drizzle-kit0.31.11 → @esbuild-kit/esm-loader2.6.5 → core-utils3.3.2 → nested esbuild | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99); <=0.24.2; patched0.25.0. Development-server exposure is Unknown.                                                                                                          |
| hono4.13.5                  | SDK→hono (also node-server peer)                                                     | [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv); <4.13.7; patched4.13.7. Affected JSX SSR use in this app is Unknown.                                                                                                      |
| ip-address10.7.0            | SDK→express-rate-limit8.7.0→ip-address                                               | [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv) and [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw); <=10.7.0; patched10.7.1. Address-family checks and oversized input reachability are Unknown. |

Three more moderate package entries are inherited esbuild findings on drizzle-kit, esm-loader and core-utils. No new advisory IDs. These versions were not changed by the targeted critical/high update. They need separately scoped remediation; do not blindly accept npm's drizzle-kit0.18.1 major downgrade. Brace's moderate advisory was resolved alongside its two high advisories.

## Tests and baseline failures

New tests: **33**, in tests/unit/dependency-security-compatibility.test.js. All pass, including native bounded child-process brace tests, patched installed/lock version checks, v1 SDK roundtrip, OAuth helper and proxy/rate-limit vectors.

- Audit tests:78 PASS/0 FAIL/0 SKIP/0 CANCEL under Node22, including actual npm script exits. Also passed in the independent clean CI tree; repetitions are not counted as new tests.
- Final normal-lifecycle-install ISSUE-01–06 rerun: **576 PASS/0 FAIL/0 SKIP/0 CANCEL**. ISSUE-03's50 callers produced one adapter invocation; ISSUE-04's50 code and50 refresh callers each produced one winner, with separate pools/service instances and independent-process tests. Snapshot immutability, permanently spent approvals, signing-key fail-closed/domain separation, provenance/narrative trust and historical artifact quarantine remain passing.
- Selected30-file application/security run:853 tests, **831 PASS/1 FAIL/21 CANCEL/0 SKIP**. This includes the prior12-file ISSUE-01–06 selection and additional MCP/auth/OAuth/proxy/web-extension/artifact suites.
- Unique selected total including33 new compatibility and78 audit tests: **964 tests:942 PASS/1 FAIL/21 CANCEL/0 SKIP**. Repeated runs and baseline reproductions are excluded from this total.
- Baseline extension failure: tests/unit/extension-prepare-handoff-regression.test.js:345, expected200, actual500/PREPARE_HANDOFF_FAILED. Reproduced under the original frozen dependencies:2 PASS/1 FAIL. Do not attribute its deeper cause to an unrelated defect without proof.
- Baseline MCP hook failure: tests/integration/mcp-final-transport-acceptance.test.js:276. Fixture creates resourceA without candidateId, then inserts evidence for candidateA;0021's source-scope guard rejects that mismatch. Reproduced under original frozen dependencies:21 CANCEL, suite hook failed. These are not passing tests. The guard and fixture were not weakened. Other MCP HTTP/auth/resource suites pass.
- The four previously documented baseline failures remain release blockers; only the extension failure above was rerun here. Do not count the other three as passing. The MCP fixture incompatibility is separately identified, not folded into those four.

Evidence logs reside in the isolated OS-Temp checkouts: before-audit.json, after-audit.json, dependency-focused-final.log, dependency-security-regressions.log, dependency-p0-final.log, dependency-baseline-extension.log, dependency-baseline-mcp-final.log, dependency-schema-integrity.log and CI audit logs. No secret values are published.

## Quality and lifecycle gates

- Modified JavaScript ESLint and syntax checks pass. CI YAML, new test, lockfile and this document formatting pass; lockfile/Markdown checks explicitly bypass the repository's formatter ignore patterns. The new ledger section is formatted without changing older ledger content. Whitespace and scoped secret checks pass. The first new-test lint errors for browser globals and a redirect-message assertion were corrected; they are not baseline failures or hidden final failures.
- Drizzle journal consistency and fresh22-migration runner pass. Live disposable schema drift:30 tables,154 indexes, zero missing declared tables/columns/indexes. Database lifecycle checker:109 files,94 DB users,0 violations.
- Static schema-integrity still fails with4 blockers: application_executions user/candidate/application foreign keys lack indexes; the GitHub resource epoch writer omits updatedAt. Original frozen-dependency run produces byte-identical output; none was fixed or waived here.
- No standalone build script exists. Real loopback Node22 listen/livez/database health/OAuth discovery pass; unauthenticated MCP is rejected401. No provider credentials, GitHub requests or employer submissions were used.
- Exact disposable PG directory confirmed after tests;22 migrations recorded, zero other client connections, CHECKPOINT succeeded, cluster stopped. Retained temporary evidence, no user data deletion and no production/staging database access.
- Full repository lint/format and three of the four historical application failures were not rerun. Their earlier results remain release blockers, not new PASS claims. Hosted CI remains **NOT VERIFIED**.

## CI, rollout and rollback

Dependency-security CI still installs the frozen tree, runs fail-closed audit tests and performs the blocking default audit. Added the33-test compatibility step with explicit NODE_ENV=test/test-only key setup. No branch protection was changed, no commit/push occurred and no hosted job was executed. Node22 local equivalents are not hosted acceptance.

No schema or migration change is required. Roll out the reviewed source+lockfile through a fresh installation, never by trusting an old node_modules tree or mutating a live dependency directory. Keep prior approval snapshots immutable, spent executions spent and OAuth lineage intact. Do not restore insecure signatures/evidence or vulnerable workers. Existing data is unaffected by this dependency-only transition.

The original lockfile is retained only in isolated diagnostic evidence. Reverting it restores known vulnerabilities and is **not** an approved production rollback. Prefer a tested secure roll-forward; if deployment rollback is necessary, choose a non-vulnerable prior build and retain the current database/security policies. Staging replica drain/restore and integration acceptance still require operators.

Before release: execute hosted Node22 job, require its status externally, refresh advisory inventory, provision isolated staging and execute ISSUE-01–06 live acceptance. Preserve existing global lint/format/schema/application blockers. Next recommended issue is **ISSUE-08**, not an implicit claim that this dependency update fixed it.

Completion decision: **FIX IMPLEMENTED BUT HOSTED/LIVE VERIFICATION REQUIRED**. The targeted critical/high entries are gone and selected compatibility/security gates pass locally. The reproduced baseline failure/cancellations and remaining moderate advisories do not become passes, and production remains NO-GO.

# ISSUE-13: Fail-closed dependency audit

Date: 2026-10-09. Scope: audit truthfulness only; no dependency upgrades or security exceptions.
Production remains NO-GO. Local checks do not establish hosted CI or staging acceptance.

## Contract and policy

| Outcome | Meaning | Wrapper exit |
| --- | --- | ---: |
| PASS — SECURITY AUDIT CLEAN | Completed, validated report; no findings prohibited by policy | 0 |
| FAIL — SECURITY ADVISORIES DETECTED | Completed report with prohibited findings | 1 |
| ERROR — SECURITY AUDIT INCOMPLETE | Audit could not reliably determine vulnerability status | 2 |

Default policy remains HIGH/CRITICAL blocking. `--strict` also blocks MODERATE.
LOW/INFO are reported, not blocked. Permitted findings are still printed; PASS means
policy-clean, not vulnerability-free. There is no allowlist or automatic exception.
The old statement that every moderate finding has zero runtime impact was unsupported
and is removed. Dependency scope must be assessed individually.

The wrapper executes the fixed command:

```sh
npm audit --json --package-lock-only --include=dev --include=optional --include=peer --audit-level=low
```

Execution is bounded to 60 seconds and 10 MiB output. Input is closed. No client text
is interpolated into the shell command. npm's ordinary exit1 can contain a valid
vulnerability report; it is not automatically an infrastructure error. Conversely,
parseable JSON with an `error` key is not a completed report. Missing/invalid version,
metadata, dependency total, severity counts, findings or inconsistent counts block
the gate. npm report version2 is supported; a new schema fails closed pending review.
Signals, timeout/spawn/permission errors, unexpected exit statuses and status1 without
findings are incomplete, even if stdout resembles a clean report.

Raw npm error messages, stderr, URLs and arbitrary advisory prose are not echoed because
they may contain credentials. The wrapper emits a fixed ERROR reason code, never a
zero-count summary for an incomplete scan. Debug raw diagnostics only in an access-controlled
environment, redact before sharing, and never publish npm config/environment dumps.

Sources: [npm audit exit behavior](https://docs.npmjs.com/cli/v11/commands/npm-audit/),
[npm ci frozen installs](https://docs.npmjs.com/cli/v11/commands/npm-ci/).

## Original CLI reproduction

Controlled responses were injected at the subprocess boundary of the actual original CLI,
before implementation changes. No live registry was required for this reproduction.

| Original subprocess outcome | Original wrapper exit/result |
| --- | --- |
| Registry unavailable, JSON error object | **0 / PASS (vulnerable)** |
| Execution error, JSON error object | **0 / PASS (vulnerable)** |
| Exit1 with valid HIGH vulnerability report | 1 / blocked |
| Malformed JSON | 1 / error |
| Empty stdout | 1 / error |
| Simulated timeout | 1 / error |
| Simulated missing executable | 1 / error |
| Successful return of valid HIGH report | 1 / blocked |

The catch block accepted any parseable stdout. `evaluateAudit` then substituted zero
counts/empty findings for absent metadata. Existing tests only supplied finding reports;
one fixture also had a summary count that disagreed with its findings. Updated fixtures
now model complete npm v2 reports; inconsistent reports have separate rejection tests.

## CI and release integration

`.github/workflows/ci.yml` has an independent blocking `dependency-security` job,
using Node22, `npm ci --ignore-scripts --no-audit`, deterministic audit tests and
`npm run audit:deps`. It does not depend on the existing failing lint/schema job.
No `continue-on-error`, `|| true`, parser fallback or missing-result success is allowed.
The main verification job still uses normal `npm ci`; its unrelated checks are unchanged.

Require **Dependency Security (fail closed)** in branch protection/release approvals.
This setting is external to the repository and must be verified by an operator.
No checked-in production deployment/release workflow consumes an audit artifact here;
external deployment automation must require this job as well. A skipped/cancelled/missing
job is not acceptance. ERROR blocks release unless a separate authorized exception records
the outage, owner, expiry, affected release and risk acceptance; the wrapper never grants it.

## Reproducible dependency state

`package.json` and committed `package-lock.json` are authoritative. Their dependency/devDependency
root declarations match. The existing checkout's installed layout differs at126 nonoptional
locked paths (missing or different); it was not repaired or used as release-install proof.

A fresh isolated Temp install using unchanged manifests and
`npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000`
succeeded:331 packages. Lockfile and manifest remained byte-identical. All nine vulnerable
package nodes below have installed versions equal to the lockfile in that clean tree.
This audit-only install deliberately does not execute package lifecycle scripts; it is not
an application build or production deployment. Local Node24.13.0/npm11.6.2 differs from
the hosted Node22 runner, whose execution remains required.

The audit explicitly reads the lockfile and includes development, optional and peer
dependencies, preventing an arbitrary local install or omit setting from defining the scan.
This is a lockfile advisory assessment, not an integrity proof for a dirty node_modules tree.

## Fresh advisory inventory

Successful registry query from the clean tree (rechecked 2026-10-09): **1 critical /2 high /6 moderate vulnerable
package nodes**, raw npm exit1; corrected wrapper exit1/FAIL. These are not counts of unique
advisories: nine distinct GHSA identifiers below comprise1 critical,3 high and5 moderate.
No exploitation was attempted or demonstrated. Runtime reachability is unverified, not
inferred solely from a package's presence. All packages are transitive except drizzle-kit
(direct development dependency).

| Package (installed = locked) | Advisory / affected range / severity | Patched version | Chain and potentially affected surface |
| --- | --- | --- | --- |
| proxy-addr2.0.7 | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h); >=1.1.0 <2.0.8; CRITICAL | 2.0.8 | @google/genai or @modelcontextprotocol/ext-apps -> peer SDK -> express -> proxy-addr. Express proxy trust/IP attribution; conditional reachability unverified. Fastify's independent proxy implementation is not proven affected. |
| @modelcontextprotocol/sdk1.30.0 | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h); >=1.12.0 <1.31.0; HIGH | 1.31.0 | @google/genai or ext-apps peer -> SDK. OAuth **client** credential routing to untrusted authorization servers; server-only use is not enough to establish exposure. |
| brace-expansion1.1.18 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7); <1.1.20; HIGH | 1.1.20 | eslint -> minimatch -> brace-expansion; build/lint input DoS, application exposure unverified. |
| brace-expansion1.1.18 | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p); <1.1.19; HIGH | 1.1.19 | Same development chain; recursive parsing DoS. |
| brace-expansion1.1.18 | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr); <1.1.21; MODERATE | 1.1.21 | Same development chain; CPU DoS.1.1.21 addresses all three listed1.x advisories. |
| esbuild0.18.20 | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99); <=0.24.2; MODERATE | >=0.25.0 | drizzle-kit0.31.11 -> @esbuild-kit/esm-loader2.6.5 -> @esbuild-kit/core-utils3.3.2 -> nested esbuild. Exposed development-server request/read surface; whether such a server runs is unverified. |
| hono4.13.5 | [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv); <4.13.7; MODERATE | 4.13.7 | SDK -> hono (also @hono/node-server peer). Untrusted strings rendered by affected JSX SSR paths; actual app path unverified. |
| ip-address10.7.0 | [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv); <=10.7.0; MODERATE | 10.7.1 | SDK -> express-rate-limit -> ip-address; address-family allowlist confusion, conditional use unverified. |
| ip-address10.7.0 | [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw); <=10.7.0; MODERATE | 10.7.1 | Same chain; oversized address parsing DoS, actual input reachability unverified. |

The other three moderate package-node findings are **metavulnerabilities**, not additional
independent GHSA advisories: drizzle-kit0.31.11, @esbuild-kit/esm-loader2.6.5 and
@esbuild-kit/core-utils3.3.2 inherit the nested esbuild advisory. npm reports their
affected ranges as0.19.0–1.0.0-beta.1-fd8bfcc, `*`, and `*` respectively. npm's proposed
fix is drizzle-kit0.18.1 (semver-major/downgrade), **not** a safe automatic recommendation.
Evaluate a compatible supported upstream/toolchain change separately.

Separate remediation priorities, not executed under ISSUE-13:

1. Review proxy-addr trust-subnet reachability and a compatible patched transitive resolution.
2. Review MCP OAuth-client paths and SDK peer compatibility before a patched SDK change.
3. Patch the development brace-expansion chain with compatible lint-tool tests.
4. Review hono/ip-address runtime reachability and patch compatible dependencies.
5. Replace/update the legacy drizzle-kit/esbuild chain without blindly accepting npm's downgrade.

## Local reproduction and acceptance

```sh
node --test tests/unit/dependency-auditor.test.js tests/unit/dependency-audit-fail-closed.test.js
npm ci --ignore-scripts --no-audit
npm run audit:deps
npm run audit:deps -- --strict
```

Run clean installation in a disposable checkout, not over a working node_modules tree.
Use the controlled test subprocess preloader only in tests; no production environment
variable selects a fake report. Tests exercise the real CLI and npm-script process exits,
including real missing-executable and timed-out child processes, without registry access.
Never treat unavailable registry service as a completed zero-finding scan.

Before release, run the independent hosted job on Node22, verify that both advisory and
infrastructure failures block its required status, and confirm external deployment rules
reject missing/skipped/cancelled audit results. Keep ISSUE-01–06 live acceptance outstanding.

## Verification results

- Focused audit tests: **78 PASS /0 FAIL /0 SKIP /0 CANCEL**, including **74 new tests** and four existing tests. Controlled CLI and actual npm-script tests verify exits0/1/2; genuine missing-executable and child-timeout tests fail closed. No live registry is needed for these tests.
- Selected ISSUE-01–06 regressions: **576 unique PASS /0 remaining FAIL /0 SKIP /0 CANCEL** across12 files. The initial run had545 PASS and31 artifact-suite setup failures because its safety guard requires a specific disposable database directory name. No guard or security assertion was changed: all31 artifact tests passed on a fresh, correctly named cluster. These were resolved environment failures, not asserted baseline product failures.
- Real PostgreSQL17 was used for the selected database/concurrency tests. ISSUE-03's50 callers produced one adapter call; ISSUE-04's50 code and50 refresh callers each produced one winner. All22 existing migrations applied to disposable databases. The final cluster target was checked, had zero other client connections, was checkpointed and stopped. Temporary evidence is retained; no staging/production database was used.
- Unique final selected total: **654 PASS /0 FAIL /0 SKIP /0 CANCEL** (78 audit +576 prior-security tests). Repeated runs are not added to this total. The previous four broader baseline failures and full-repository lint/schema failures were not rerun or classified as passing here.
- Final clean-tree live registry query and wrapper both returned **exit1** for the documented advisories. The raw JSON report and wrapper agree on1 critical,2 high,6 moderate vulnerable package entries. This expected release-gate failure is not a test failure or a clean dependency scan.
- Modified JavaScript ESLint, syntax and JavaScript/CI-YAML Prettier checks passed; whitespace and scoped secret checks passed. A clean isolated toolchain was used because the existing checkout lacked a required formatter plugin. Dependency manifests, lockfile, source security implementations and schema/migrations were not changed.
- Hosted Node22 CI, branch protection and external deployment enforcement remain **NOT VERIFIED**. Local wiring and process-exit tests do not substitute for a required hosted status. Completion decision: **FIX IMPLEMENTED BUT CI/LIVE VERIFICATION REQUIRED**.

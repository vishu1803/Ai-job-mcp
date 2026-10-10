# PRD-001: persisted analysis serialization

Status: COMPLETE — locally implemented and integration verified on 2026-10-10. Scope: analysis snapshot JSON projection and directly related preparation tests only. Production remains NO-GO.

## Reproduction before production edits

On 2026-10-10, Node 22.23.3 and a new disposable PostgreSQL 17.4 cluster on loopback port 55440, with all 22 migrations and isolated test-only ENV_FILE, reproduced the existing extension regression: 3 tests, 2 passed, 1 failed. Authenticated POST `/api/extension/prepare-handoff` returned HTTP 500 with `PREPARE_HANDOFF_FAILED`.

The added boundary assertion then failed with `Application package must contain only JSON values` / `INVALID_PACKAGE_CONTENT`. Drizzle's typed `jobAnalysisSnapshots.analyzedAt` mapping returns a native Date. The raw SQL driver path can instead return text; the typed ORM read is the relevant production path.

Flow: server analyze-job computes analysis → saveSnapshot writes JSONB analysis and a native Date to analyzed_at timestamptz → Drizzle reads analyzedAt as Date → getValidatedSnapshot checks ownership, job, version, TTL and content hash → toWorkflowJobFit passes Date unchanged → workflow puts the projection in targetJob, answers and jobFitAnalysis → strict canonical package hashing rejects Date → route returns sanitized HTTP 500. Internal domain schemas accept Date; the persisted snapshot schema formerly also accepted arbitrary strings. No conversion defect in PostgreSQL storage itself was established.

Before-edit logs: OS Temp `career-prd001-fdb34af5a49b4848904c01595e5dee89/baseline.log` and `root-cause.log`. Test renderer and AI response are controlled fixtures, not proof of real rendering or live provider integration.

## Canonical contract and minimal repair

`AnalysisTimestampSchema` accepts finite native Dates and valid ISO date-times with explicit UTC/offset, at up to millisecond precision. Output is always `YYYY-MM-DDTHH:mm:ss.sssZ`. Equivalent offsets normalize to the same instant. Legacy ISO strings without a fractional part remain supported. Ambiguous timezone-less strings, epoch numbers, invalid calendar dates, invalid offsets, invalid Dates and sub-millisecond strings are rejected, rather than silently truncating meaningful data.

The root `analyzedAt` is required and not nullable. Root `createdAt` and `updatedAt`, and nested evidence `detectedAt`, may be absent where their schemas permit it; none of these timestamps permit null. Existing nullable data such as `normalizedJobUrl`, metadata values and evidence fields retain null. Other fields are copied without string coercion or mutation. Unknown native Dates are not silently converted; the existing JSON-only canonicalizer continues to reject non-JSON package values.

Changes are confined to `src/domain/career/analysis-snapshot.schemas.js` and `src/services/job-analysis-snapshot.service.js`:

- Before JSONB write, the reusable serializer normalizes recognized `analyzedAt` and `detectedAt` keys inside the six analysis payload fields, including nested evidence. Invalid values fail with `INVALID_ANALYSIS_SNAPSHOT` before any write. PostgreSQL timestamp columns continue to receive native Dates, and typed reads continue returning native Dates.
- At `toWorkflowJobFit`, `serializeJobAnalysisSnapshot` validates the snapshot schema and normalizes the root analyzed/created/updated timestamps and recognized nested timestamps. This is the explicit JSON projection before package construction. Already approved package payloads never pass through this serializer.
- After ownership/job/version checks, an invalid root timestamp fails the TTL gate with `INVALID_ANALYSIS_TIMESTAMP`. It cannot accidentally pass through a NaN comparison. Existing expiry, contract, content hash and 403/409 boundaries remain in place.

No migration, dependency, application package schema/version, canonical hash algorithm, signing secret, approval binding or immutable execution snapshot change. The normalization does not invent candidate facts.

## Hash and version boundaries

The root and nested analysis timestamps included in the workflow projection remain approval-sensitive package content. Tests prove equivalent timestamp representations hash identically, and a changed instant or job content hash changes the package hash. All three package locations (targetJob, answers and top-level jobFitAnalysis) contain canonical analysis JSON.

Snapshot storage bookkeeping `createdAt`, `updatedAt` and metadata remain outside the workflow projection as before; tests verify root storage bookkeeping does not change package identity. This repair adds no new hash exclusions. Package reloads retain the returned hash and version; preview returns matching authoritative approval content. Independent re-analysis or regeneration may create a different version because authoritative content changed. That is separate from persistence round-trip stability and must not be disguised by dropping hash-bound fields.

## Verification

New unit coverage includes native Date/canonical ISO/positive and negative equivalent offsets, invalid Dates/calendar/offsets, timezone-less and excessive-precision rejection, missing optional timestamps, allowed null data, malformed records, nested dates, legacy strings, source immutability, repeated serialization, hash sensitivity, and invalid timestamp ownership/TTL order.

The enhanced `tests/unit/extension-prepare-handoff-regression.test.js` is historically located under unit, but now uses a real loopback Fastify listener and fetch for authenticated analyze, prepare and preview. It uses real PostgreSQL sessions, snapshot save/reload, package persistence, unmocked canonical hashing and authoritative preview. It checks HTTP 401 without authentication and existing cross-candidate 403, unchanged candidate profile, metadata/download-link shape and repeated DB reload hash/version stability. Resume AI and compiler remain controlled substitutes.

An intermediate six-file run was 98 tests / 97 PASS / 1 FAIL: the newly added preparation test selected an older package by application ID alone after re-analysis created a new version. The fixture lookup was corrected to the exact returned application ID/hash/version, without changing runtime versioning or weakening assertions.

Final eight-file gate: **175 tests / 175 PASS / 0 FAIL / 0 CANCEL / 0 SKIP**, Node 22.23.3 and real disposable PostgreSQL 17.4. This includes strict package identity, snapshot ownership/job/TTL/hash checks, MCP/extension parity, immutable approval content/tamper/signing checks and durable single-owner execution with controlled adapters. Runtime canonicalizer, approval and execution source files are unchanged. Log: OS Temp `career-prd001-fdb34af5a49b4848904c01595e5dee89/verified-gates.log`. Intermediate runs overlap and are not summed with this total. Scoped ESLint, Prettier and whitespace checks passed.

Cleanup verified the exact new Temp data directory, 22 migrations, zero fixture tenants and zero other client backends; only this disposable cluster was stopped successfully. Logs are retained.

Reproduce using a new empty disposable loopback `product_audit_*` PostgreSQL database with all repository migrations, Node 22, and isolated test environment:

```powershell
node scripts/run-product-functional-audit.mjs --database-url postgres://postgres@127.0.0.1:55440/product_audit_prd001 --env-only
# Set ENV_FILE to the printed directory's audit.env; use a fresh database before migrating.
$env:ENV_FILE = '<printed-directory>\audit.env'
node src/db/migrate.js
node --import ./tests/setup/approval-signing-env.js --test --test-concurrency=1 --test-timeout=180000 tests/unit/prd001-analysis-serialization.test.js tests/unit/extension-prepare-handoff-regression.test.js tests/unit/p16-001f3b-score-parity.test.js tests/unit/application-package-identity.test.js tests/integration/p16-001f3b-analysis-snapshot.test.js tests/integration/application-approval-content-binding.test.js tests/integration/application-approval-execution.test.js tests/integration/mcp-extension-unified-pipeline-parity.test.js
```

No real provider, employer submission, installed-extension journey, independent PDF quality acceptance or hosted release verification is claimed. Those remain outside PRD-001. Production stays NO-GO.

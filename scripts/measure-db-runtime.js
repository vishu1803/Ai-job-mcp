/**
 * @file Runtime PostgreSQL Measurement Harness (Phase 1 — local/Aiven configuration).
 *
 * Purpose: separate POOL QUEUEING from STATEMENT EXECUTION and ROUTE-LEVEL work
 * on the configured database, so the local runtime failure can be attributed to
 * a layer rather than guessed at.
 *
 * Measures (read-only, zero writes, zero schema changes):
 *   1. Effective pool configuration (min/max, statement_timeout, server caps).
 *   2. Connection acquisition time (cold, sequential, concurrent, oversubscribed).
 *   3. Statement execution time for the exact queries observed in runtime logs.
 *   4. Route-equivalent total time for the dashboard and handoff critical paths.
 *
 * Safety:
 *   - SELECT-only. No INSERT/UPDATE/DELETE/DDL is issued.
 *   - Uses the shared singleton pool, then calls closeDatabase() in a finally block.
 *   - Never prints DATABASE_URL credentials (host/port only, sanitized).
 *
 * Usage:
 *   node scripts/measure-db-runtime.js
 *   node scripts/measure-db-runtime.js --tenant=<uuid> --candidate=<uuid>
 *   node scripts/measure-db-runtime.js --iterations=7 --concurrency=15 --json
 *
 * Defaults reproduce the IDs recorded in the runtime evidence:
 *   tenant     = 24d53f53-780e-4431-b065-32180c354175
 *   candidate  = 10a2b51b-09bf-4090-8040-1f60ebeb89c9
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import { db, pool, closeDatabase, getPoolConfig, parseSanitizedDbUrl } from '../src/db/index.js';
import { CandidateProfileService } from '../src/services/candidate-profile.service.js';
import { CandidateArtifactContentService } from '../src/services/candidate-artifact-content.service.js';

// Match application env precedence: .env first, then .env.local overriding.
dotenv.config();
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const DEFAULT_TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
const DEFAULT_CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

// Counts every query issued through the pool (drizzle's node-postgres driver
// routes all reads/writes through `pool.query`). Used to attribute serial
// round-trips to the code paths that issue them.
const queryCounter = { count: 0 };
const _originalPoolQuery = pool.query.bind(pool);
pool.query = (...args) => {
  queryCounter.count += 1;
  return _originalPoolQuery(...args);
};

/**
 * Runs an async function and reports elapsed time plus the number of database
 * round-trips it issued. Only meaningful for sequential (non-concurrent) runs.
 *
 * @param {Function} fn Async function to run
 * @returns {Promise<{ms: number, queries: number}>} Timing and query count
 */
async function timedWithQueryCount(fn) {
  const start = performance.now();
  const before = queryCounter.count;
  await fn();
  return { ms: round(performance.now() - start), queries: queryCounter.count - before };
}

/**
 * Parses CLI arguments into measurement options.
 *
 * @param {string[]} args Process arguments
 * @returns {object} Parsed options
 */
export function parseArgs(args = process.argv.slice(2)) {
  const options = {
    tenantId: DEFAULT_TENANT_ID,
    candidateId: DEFAULT_CANDIDATE_ID,
    iterations: 5,
    concurrency: 15,
    json: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--tenant=')) options.tenantId = arg.split('=')[1].trim();
    else if (arg.startsWith('--candidate=')) options.candidateId = arg.split('=')[1].trim();
    else if (arg.startsWith('--iterations=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (Number.isInteger(n) && n > 0) options.iterations = n;
    } else if (arg.startsWith('--concurrency=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (Number.isInteger(n) && n > 0) options.concurrency = n;
    }
  }

  return options;
}

/**
 * Computes a small latency distribution.
 *
 * @param {number[]} samples Durations in milliseconds
 * @returns {{count: number, minMs: number, p50Ms: number, p95Ms: number, maxMs: number, meanMs: number}}
 */
export function summarize(samples) {
  if (!samples.length) {
    return { count: 0, minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, meanMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    count: sorted.length,
    minMs: round(sorted[0]),
    p50Ms: round(at(0.5)),
    p95Ms: round(at(0.95)),
    maxMs: round(sorted[sorted.length - 1]),
    meanMs: round(mean),
  };
}

/**
 * Rounds to 1 decimal place.
 *
 * @param {number} value Value
 * @returns {number} Rounded value
 */
function round(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Times a single pooled query.
 *
 * @param {string} label Query label
 * @param {string} text SQL text
 * @param {unknown[]} params Query parameters
 * @param {number} iterations Number of repetitions
 * @returns {Promise<{label: string, distribution: object, rowCount: number, error: string|null}>}
 */
async function measureQuery(label, text, params, iterations) {
  const samples = [];
  let rowCount = 0;
  let error = null;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const result = await pool.query(text, params);
      rowCount = result.rowCount;
      samples.push(performance.now() - start);
    } catch (err) {
      error = `${err.code || 'ERROR'}: ${err.message}`;
      break;
    }
  }

  return { label, distribution: summarize(samples), rowCount, error };
}

/**
 * Records EXPLAIN (ANALYZE, BUFFERS) execution time for a query.
 *
 * @param {string} label Query label
 * @param {string} text SQL text
 * @param {unknown[]} params Query parameters
 * @returns {Promise<object|null>} Plan summary or null when unavailable
 */
async function explainQuery(label, text, params) {
  try {
    const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, params);
    const plan = result.rows[0]['QUERY PLAN'][0];
    return {
      label,
      executionTimeMs: round(plan['Execution Time']),
      planningTimeMs: round(plan['Planning Time']),
      topNode: plan.Plan['Node Type'],
      rowsScanned: plan.Plan['Actual Rows'],
    };
  } catch (err) {
    return { label, error: `${err.code || 'ERROR'}: ${err.message}` };
  }
}

/**
 * Measures connection acquisition under a given concurrency.
 *
 * @param {number} count Number of simultaneous acquisitions
 * @returns {Promise<{distribution: object, failures: number, errors: string[]}>}
 */
async function measureAcquisition(count) {
  const samples = [];
  const errors = [];

  await Promise.all(
    Array.from({ length: count }, async () => {
      const start = performance.now();
      try {
        const client = await pool.connect();
        samples.push(performance.now() - start);
        client.release();
      } catch (err) {
        errors.push(`${err.code || 'ERROR'}: ${err.message}`);
      }
    })
  );

  return { distribution: summarize(samples), failures: errors.length, errors };
}

/**
 * Runs the full measurement suite.
 *
 * @param {object} options Parsed options
 * @returns {Promise<object>} Report
 */
export async function measure(options) {
  const report = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV || 'development',
    ids: { tenantId: options.tenantId, candidateId: options.candidateId },
  };

  const sanitized = parseSanitizedDbUrl();
  const poolCfg = getPoolConfig();
  report.poolConfig = {
    host: sanitized.host,
    port: sanitized.port,
    database: sanitized.database,
    ssl: sanitized.ssl,
    min: poolCfg.min,
    max: poolCfg.max,
    statementTimeoutMs: poolCfg.statement_timeout,
    connectionTimeoutMs: poolCfg.connectionTimeoutMillis,
  };

  // 0. Server-side session settings (proves what the pool actually inherited).
  const settings = await pool.query(`
    SELECT current_setting('statement_timeout') AS statement_timeout,
           current_setting('lock_timeout') AS lock_timeout,
           current_setting('idle_in_transaction_session_timeout') AS idle_in_transaction_timeout,
           current_setting('server_version') AS server_version,
           (SELECT setting FROM pg_settings WHERE name = 'max_connections') AS max_connections
  `);
  report.serverSettings = settings.rows[0];

  // 1. Connection acquisition: cold single, concurrent at pool size, oversubscribed.
  const coldStart = performance.now();
  const warmClient = await pool.connect();
  const coldMs = performance.now() - coldStart;
  warmClient.release();
  report.acquisition = {
    coldSingleMs: round(coldMs),
    atPoolSize: await measureAcquisition(poolCfg.max),
    oversubscribed: await measureAcquisition(poolCfg.max + 5),
    poolStateAfter: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    },
  };

  // 2. Statement execution for the exact logged query shapes.
  const applicationsSql = `select id, tenant_id, candidate_id, status, updated_at
     from job_applications
     where tenant_id = $1 and candidate_id = $2
     order by updated_at desc`;
  const applicationsSqlLimited = `${applicationsSql} limit 10`;

  // Resolve a real project-id set for the evidence query IN list.
  const projectRows = await pool.query(
    `select distinct project_id from evidence_items
     where tenant_id = $1 and candidate_id = $2 and project_id is not null
     limit 11`,
    [options.tenantId, options.candidateId]
  );
  const projectIds = projectRows.rows.map((r) => r.project_id);

  // Resolve the real owning user so RBAC checks pass (userId is not tenantId).
  const userRows = await pool.query(
    `select user_id from candidates where tenant_id = $1 and id = $2 limit 1`,
    [options.tenantId, options.candidateId]
  );
  const resolvedUserId = userRows.rows[0]?.user_id || null;
  report.ids.userId = resolvedUserId;

  const evidenceSql = `select e.id, e.tenant_id, e.candidate_id, e.resource_id, e.project_id,
       e.skill_id, e.evidence_type, e.source_provider, e.source_location, e.excerpt,
       e.confidence_score, e.metadata, e.detected_at, s.slug, s.name
     from evidence_items e
     left join skills s on e.skill_id = s.id
     where e.tenant_id = $1 and e.candidate_id = $2
       and e.project_id = any($3::uuid[])
     order by e.confidence_score desc, e.detected_at desc, e.id asc`;

  const deleteSql = `select metadata from tailored_documents
     where tenant_id = $1 and application_id <> $2`;

  report.statements = [];
  report.statements.push(
    await measureQuery(
      'job_applications.list',
      applicationsSql,
      [options.tenantId, options.candidateId],
      options.iterations
    )
  );
  report.statements.push(
    await measureQuery(
      'job_applications.list_limit10',
      applicationsSqlLimited,
      [options.tenantId, options.candidateId],
      options.iterations
    )
  );
  report.statements.push(
    await measureQuery(
      'evidence_items.for_handoff',
      evidenceSql,
      [options.tenantId, options.candidateId, projectIds],
      options.iterations
    )
  );
  report.statements.push(
    await measureQuery(
      'tailored_documents.other_than_application',
      deleteSql,
      [options.tenantId, '00000000-0000-0000-0000-000000000000'],
      options.iterations
    )
  );

  // 2b. Isolate the delete query: result footprint vs transfer vs execution.
  const deleteParams = [options.tenantId, '00000000-0000-0000-0000-000000000000'];
  const footprint = await pool.query(
    `select count(*)::int as rows,
            coalesce(sum(length(metadata::text)), 0)::bigint as bytes
       from tailored_documents
      where tenant_id = $1 and application_id <> $2`,
    deleteParams
  );
  report.deleteQueryFootprint = {
    rows: footprint.rows[0].rows,
    metadataBytes: Number(footprint.rows[0].bytes),
  };

  // Re-time the same transfer with a raised session timeout (read-only, reset after).
  const transferClient = await pool.connect();
  try {
    await transferClient.query(`SET statement_timeout = '120000'`);
    const t0 = performance.now();
    const transferred = await transferClient.query(deleteSql, deleteParams);
    report.deleteQueryTransfer = {
      rows: transferred.rowCount,
      transferMs: round(performance.now() - t0),
    };
  } catch (err) {
    report.deleteQueryTransfer = { error: `${err.code || 'ERROR'}: ${err.message}` };
  } finally {
    await transferClient.query(`SET statement_timeout = '${poolCfg.statement_timeout}'`);
    transferClient.release();
  }

  // 3. EXPLAIN for the two queries most implicated in the failures.
  report.explains = [
    await explainQuery('job_applications.list', applicationsSql, [
      options.tenantId,
      options.candidateId,
    ]),
    await explainQuery('tailored_documents.other_than_application', deleteSql, [
      options.tenantId,
      '00000000-0000-0000-0000-000000000000',
    ]),
  ];

  // 4. Route-equivalent total time at the service boundary.
  const context = {
    tenantId: options.tenantId,
    userId: resolvedUserId || options.tenantId,
    role: 'OWNER',
  };
  const profileService = new CandidateProfileService(db);
  const artifactService = new CandidateArtifactContentService({
    database: db,
    candidateProfileService: profileService,
  });

  const routeSamples = { getCareerProfile: [], loadCandidateProfile: [] };
  const routeQueryCounts = { getCareerProfile: [], loadCandidateProfile: [] };
  const routeErrors = { getCareerProfile: null, loadCandidateProfile: null };

  for (let i = 0; i < options.iterations; i++) {
    try {
      const timed = await timedWithQueryCount(() =>
        profileService.getCareerProfile(context, options.candidateId)
      );
      routeSamples.getCareerProfile.push(timed.ms);
      routeQueryCounts.getCareerProfile.push(timed.queries);
    } catch (err) {
      routeErrors.getCareerProfile = `${err.code || 'ERROR'}: ${err.message}`;
      break;
    }
  }

  for (let i = 0; i < options.iterations; i++) {
    try {
      const timed = await timedWithQueryCount(() =>
        artifactService.loadCandidateProfile({
          tenantId: options.tenantId,
          userId: context.userId,
          candidateId: options.candidateId,
        })
      );
      routeSamples.loadCandidateProfile.push(timed.ms);
      routeQueryCounts.loadCandidateProfile.push(timed.queries);
    } catch (err) {
      routeErrors.loadCandidateProfile = `${err.code || 'ERROR'}: ${err.message}`;
      break;
    }
  }

  report.routeEquivalents = {
    getCareerProfile: {
      distribution: summarize(routeSamples.getCareerProfile),
      queriesPerCall: [...new Set(routeQueryCounts.getCareerProfile)],
      error: routeErrors.getCareerProfile,
    },
    loadCandidateProfile: {
      distribution: summarize(routeSamples.loadCandidateProfile),
      queriesPerCall: [...new Set(routeQueryCounts.loadCandidateProfile)],
      error: routeErrors.loadCandidateProfile,
    },
  };

  // 4b. Handoff critical path: buildCandidateData() is the stage the runtime log
  // blamed via "Real document content generation failed". Measure it directly,
  // including how many serial database round-trips it issues.
  const minimalJobPosting = {
    title: 'Senior Backend Engineer',
    company: 'Acme Cloud',
    description: 'Distributed systems, PostgreSQL, and Node.js services.',
    skills: ['PostgreSQL', 'Node.js'],
    requirements: ['5+ years backend engineering'],
    responsibilities: ['Design and ship APIs'],
  };

  const buildCandidateDataRuns = [];
  const buildCandidateDataErrors = [];
  for (let i = 0; i < options.iterations; i++) {
    try {
      const timed = await timedWithQueryCount(() =>
        artifactService.buildCandidateData({
          tenantId: options.tenantId,
          userId: context.userId,
          candidateId: options.candidateId,
          jobPosting: minimalJobPosting,
        })
      );
      buildCandidateDataRuns.push(timed);
    } catch (err) {
      buildCandidateDataErrors.push(`${err.code || 'ERROR'}: ${err.message}`);
      break;
    }
  }

  report.handoffBuildCandidateData = {
    distribution: summarize(buildCandidateDataRuns.map((r) => r.ms)),
    queriesPerCall: [...new Set(buildCandidateDataRuns.map((r) => r.queries))],
    errors: [...new Set(buildCandidateDataErrors)],
  };

  // 5. Concurrency test: does the dashboard critical path survive at poolMax+5?
  const concurrencySamples = [];
  const concurrencyErrors = [];
  await Promise.all(
    Array.from({ length: options.concurrency }, async () => {
      const t0 = performance.now();
      try {
        await profileService.getCareerProfile(context, options.candidateId);
        concurrencySamples.push(performance.now() - t0);
      } catch (err) {
        concurrencyErrors.push(`${err.code || 'ERROR'}: ${err.message}`);
      }
    })
  );

  report.concurrency = {
    requested: options.concurrency,
    succeeded: concurrencySamples.length,
    failed: concurrencyErrors.length,
    distribution: summarize(concurrencySamples),
    sampleErrors: [...new Set(concurrencyErrors)].slice(0, 5),
  };

  return report;
}

/**
 * Renders a human-readable report.
 *
 * @param {object} report Measurement report
 * @returns {string} Formatted text
 */
export function formatReport(report) {
  const lines = [];
  lines.push('='.repeat(72));
  lines.push('  RUNTIME POSTGRES MEASUREMENT — POOL / STATEMENT / ROUTE / HANDOFF');
  lines.push('='.repeat(72));
  lines.push(`Node: ${report.nodeVersion} | NODE_ENV: ${report.nodeEnv}`);
  const p = report.poolConfig;
  lines.push(
    `DB: ${p.host}:${p.port}/${p.database} ssl=${p.ssl} | pool min=${p.min} max=${p.max} | statement_timeout=${p.statementTimeoutMs}ms | connect_timeout=${p.connectionTimeoutMs}ms`
  );
  const s = report.serverSettings;
  lines.push(
    `Server: pg ${s.server_version} | max_connections=${s.max_connections} | statement_timeout="${s.statement_timeout}" | lock_timeout="${s.lock_timeout}" | idle_in_tx="${s.idle_in_transaction_timeout}"`
  );

  lines.push('');
  lines.push('--- 1. CONNECTION ACQUISITION (ms) ---');
  lines.push(`cold single:           ${report.acquisition.coldSingleMs}`);
  lines.push(
    `at pool size (${p.max}):    p50=${report.acquisition.atPoolSize.distribution.p50Ms} p95=${report.acquisition.atPoolSize.distribution.p95Ms} max=${report.acquisition.atPoolSize.distribution.maxMs} failures=${report.acquisition.atPoolSize.failures}`
  );
  lines.push(
    `oversubscribed (${p.max + 5}): p50=${report.acquisition.oversubscribed.distribution.p50Ms} p95=${report.acquisition.oversubscribed.distribution.p95Ms} max=${report.acquisition.oversubscribed.distribution.maxMs} failures=${report.acquisition.oversubscribed.failures}`
  );
  if (report.acquisition.oversubscribed.errors.length) {
    lines.push(`  errors: ${[...new Set(report.acquisition.oversubscribed.errors)].join(' | ')}`);
  }
  const ps = report.acquisition.poolStateAfter;
  lines.push(`pool after: total=${ps.totalCount} idle=${ps.idleCount} waiting=${ps.waitingCount}`);

  lines.push('');
  lines.push('--- 2. STATEMENT EXECUTION (ms) ---');
  for (const stmt of report.statements) {
    const d = stmt.distribution;
    const suffix = stmt.error ? ` ERROR=${stmt.error}` : ` rows=${stmt.rowCount}`;
    lines.push(
      `${stmt.label.padEnd(42)} p50=${String(d.p50Ms).padStart(8)} p95=${String(d.p95Ms).padStart(8)} max=${String(d.maxMs).padStart(8)}${suffix}`
    );
  }

  if (report.deleteQueryFootprint) {
    lines.push('');
    lines.push('--- 2b. DELETE QUERY FOOTPRINT / TRANSFER ---');
    lines.push(
      `rows=${report.deleteQueryFootprint.rows} metadataBytes=${report.deleteQueryFootprint.metadataBytes}`
    );
    if (report.deleteQueryTransfer) {
      lines.push(
        report.deleteQueryTransfer.error
          ? `transfer ERROR=${report.deleteQueryTransfer.error}`
          : `transfer rows=${report.deleteQueryTransfer.rows} transferMs=${report.deleteQueryTransfer.transferMs}`
      );
    }
  }

  lines.push('');
  lines.push('--- 3. EXPLAIN (ANALYZE, BUFFERS) ---');
  for (const ex of report.explains) {
    if (ex.error) lines.push(`${ex.label.padEnd(42)} ERROR=${ex.error}`);
    else
      lines.push(
        `${ex.label.padEnd(42)} exec=${ex.executionTimeMs}ms plan=${ex.planningTimeMs}ms topNode=${ex.topNode} rows=${ex.rowsScanned}`
      );
  }

  lines.push('');
  lines.push('--- 4. ROUTE-EQUIVALENT TOTAL (service boundary, ms) ---');
  for (const [name, entry] of Object.entries(report.routeEquivalents)) {
    const d = entry.distribution;
    const suffix = entry.error ? ` ERROR=${entry.error}` : '';
    const queries = entry.queriesPerCall?.length
      ? ` queries=${entry.queriesPerCall.join(', ')}`
      : '';
    lines.push(
      `${name.padEnd(42)} p50=${String(d.p50Ms).padStart(8)} p95=${String(d.p95Ms).padStart(8)} max=${String(d.maxMs).padStart(8)}${queries}${suffix}`
    );
  }

  if (report.handoffBuildCandidateData) {
    const h = report.handoffBuildCandidateData;
    lines.push('');
    lines.push('--- 4b. HANDOFF buildCandidateData() (ms, serial DB round-trips) ---');
    lines.push(
      `p50=${h.distribution.p50Ms} p95=${h.distribution.p95Ms} max=${h.distribution.maxMs} | queries/call=${h.queriesPerCall.join(', ') || 'n/a'}${h.errors.length ? ` ERROR=${h.errors.join(' | ')}` : ''}`
    );
  }

  lines.push('');
  lines.push(`--- 5. CONCURRENCY @ ${report.concurrency.requested} (dashboard critical path) ---`);
  lines.push(
    `succeeded=${report.concurrency.succeeded} failed=${report.concurrency.failed} p50=${report.concurrency.distribution.p50Ms}ms p95=${report.concurrency.distribution.p95Ms}ms`
  );
  if (report.concurrency.sampleErrors.length) {
    lines.push(`sample errors: ${report.concurrency.sampleErrors.join(' | ')}`);
  }
  lines.push('='.repeat(72));

  return lines.join('\n');
}

/**
 * CLI entrypoint.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(
      'Usage: node scripts/measure-db-runtime.js [--tenant=<uuid>] [--candidate=<uuid>] [--iterations=N] [--concurrency=N] [--json]'
    );
    return;
  }

  let report;
  try {
    report = await measure(options);
  } finally {
    await closeDatabase();
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('measure-db-runtime.js')) {
  main().catch((err) => {
    console.error('Measurement failed:', err);
    process.exitCode = 1;
  });
}

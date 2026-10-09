import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_COMMAND,
  AUDIT_TIMEOUT_MS,
  AuditIncompleteError,
  evaluateAudit,
  runNpmAudit,
  runAuditCli,
} from '../../scripts/audit-dependencies.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('../../scripts/audit-dependencies.js', import.meta.url));
const preload = new URL('../fixtures/dependency-audit-subprocess.mjs', import.meta.url).href;
const severities = ['info', 'low', 'moderate', 'high', 'critical'];

function report(levels = []) {
  const counts = Object.fromEntries(severities.map((severity) => [severity, 0]));
  const vulnerabilities = {};
  levels.forEach((severity, index) => {
    counts[severity]++;
    const name = `package-${index}`;
    vulnerabilities[name] = {
      name,
      severity,
      isDirect: index === 0,
      range: '<2.0.0',
      via: [{ name, title: 'Controlled advisory', severity }],
      effects: [],
      nodes: [`node_modules/${name}`],
      fixAvailable: { name, version: '2.0.0', isSemVerMajor: false },
    };
  });
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { ...counts, total: levels.length }, dependencies: { total: 50 } },
  };
}

function controlled(response) {
  return (_command, _options) => {
    if (response.status === 0 && !response.code && !response.signal) return response.stdout;
    throw Object.assign(new Error('DO_NOT_LOG_PRIVATE_DIAGNOSTICS'), response);
  };
}

function invoke(response, args = []) {
  const result = spawnSync(process.execPath, ['--import', preload, cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, TEST_AUDIT_RESPONSE: JSON.stringify(response) },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { ...result, output: result.stdout + result.stderr };
}

describe('ISSUE-13: report integrity and policy', () => {
  it('accepts a complete zero-vulnerability report', () => {
    assert.equal(evaluateAudit(report()).passed, true);
  });
  for (const severity of severities) {
    it(`preserves default policy for ${severity} findings`, () => {
      const result = evaluateAudit(report([severity]));
      assert.equal(result.passed, !['high', 'critical'].includes(severity));
      assert.equal(result.summary[severity], 1);
      assert.equal(result.findings.length, 1);
    });
  }
  it('strict mode rejects moderate findings without suppressing them', () => {
    assert.equal(evaluateAudit(report(['moderate']), { strict: true }).exitCode, 1);
  });
  it('reports multiple severities accurately', () => {
    const result = evaluateAudit(report(['critical', 'high', 'moderate', 'moderate']));
    assert.equal(result.exitCode, 1);
    assert.equal(result.criticalHighFindings.length, 2);
    assert.equal(result.moderateFindings.length, 2);
    assert.equal(result.summary.total, 4);
  });
  const invalidReports = {
    null: null,
    array: [],
    empty: {},
    'npm error object': { error: { code: 'E503' } },
    'error alongside valid metadata': { ...report(), error: {} },
    'unknown version': { ...report(), auditReportVersion: 3 },
    'missing findings': { ...report(), vulnerabilities: undefined },
    'missing metadata': { ...report(), metadata: undefined },
    'missing dependency total': {
      ...report(),
      metadata: { ...report().metadata, dependencies: {} },
    },
    'summary contradicts findings': { ...report(['high']), vulnerabilities: {} },
  };
  for (const [name, input] of Object.entries(invalidReports)) {
    it(`rejects ${name}`, () => assert.throws(() => evaluateAudit(input), AuditIncompleteError));
  }
  for (const severity of [...severities, 'total']) {
    it(`rejects missing ${severity} count`, () => {
      const input = report();
      delete input.metadata.vulnerabilities[severity];
      assert.throws(() => evaluateAudit(input), AuditIncompleteError);
    });
  }
  for (const value of [-1, 0.5, '0', NaN, Infinity]) {
    it(`rejects invalid numeric count ${String(value)}`, () => {
      const input = report();
      input.metadata.vulnerabilities.high = value;
      assert.throws(() => evaluateAudit(input), AuditIncompleteError);
    });
  }
  for (const field of [
    'name',
    'severity',
    'isDirect',
    'range',
    'via',
    'effects',
    'nodes',
    'fixAvailable',
  ]) {
    it(`rejects incomplete finding field ${field}`, () => {
      const input = report(['high']);
      delete input.vulnerabilities['package-0'][field];
      assert.throws(() => evaluateAudit(input), AuditIncompleteError);
    });
  }
  it('rejects unknown severity rather than silently dropping it', () => {
    const input = report(['high']);
    input.vulnerabilities['package-0'].severity = 'unknown';
    assert.throws(() => evaluateAudit(input), AuditIncompleteError);
  });
  it('rejects findings that understate an underlying advisory severity', () => {
    const input = report(['moderate']);
    input.vulnerabilities['package-0'].via[0].severity = 'critical';
    assert.throws(() => evaluateAudit(input), AuditIncompleteError);
  });
});

describe('ISSUE-13: subprocess and actual CLI failure propagation', () => {
  const cases = [
    ['clean', { status: 0, stdout: JSON.stringify(report()) }, 0],
    ['permitted moderate', { status: 1, stdout: JSON.stringify(report(['moderate'])) }, 0],
    ['high', { status: 1, stdout: JSON.stringify(report(['high'])) }, 1],
    ['critical', { status: 1, stdout: JSON.stringify(report(['critical'])) }, 1],
    [
      'valid report with zero process status',
      { status: 0, stdout: JSON.stringify(report(['high'])) },
      1,
    ],
    ['registry timeout', { status: 1, stdout: '{"error":{"code":"ETIMEDOUT"}}' }, 2],
    ['registry 5xx', { status: 1, stdout: '{"error":{"code":"E503"}}' }, 2],
    ['DNS error', { status: 1, stdout: '{"error":{"code":"ENOTFOUND"}}' }, 2],
    ['authentication failure', { status: 1, stdout: '{"error":{"code":"E401"}}' }, 2],
    ['execution error', { status: 1, stdout: '{"error":{"code":"EEXEC"}}' }, 2],
    ['malformed JSON', { status: 0, stdout: '{broken' }, 2],
    ['empty stdout', { status: 0, stdout: '' }, 2],
    ['missing executable', { status: null, code: 'ENOENT', stdout: '' }, 2],
    ['permission failure', { status: null, code: 'EACCES', stdout: '' }, 2],
    [
      'subprocess timeout',
      { status: null, code: 'ETIMEDOUT', stdout: JSON.stringify(report()) },
      2,
    ],
    ['termination', { status: null, signal: 'SIGTERM', stdout: JSON.stringify(report()) }, 2],
    ['unexpected exit', { status: 42, stdout: JSON.stringify(report(['high'])) }, 2],
    ['nonzero without findings', { status: 1, stdout: JSON.stringify(report()) }, 2],
    ['incomplete metadata', { status: 0, stdout: '{"metadata":{"vulnerabilities":{}}}' }, 2],
    ['error with status zero', { status: 0, stdout: '{"error":{"code":"E503"}}' }, 2],
    [
      'output buffer exceeded',
      { status: null, code: 'ENOBUFS', stdout: JSON.stringify(report()) },
      2,
    ],
    [
      'error alongside findings',
      { status: 1, stdout: JSON.stringify({ ...report(['moderate']), error: { code: 'E503' } }) },
      2,
    ],
  ];
  for (const [name, response, expected] of cases) {
    it(`CLI ${name}: exits ${expected} with truthful classification`, () => {
      const result = invoke(response);
      assert.equal(result.status, expected, result.output);
      assert.equal(result.output.includes('PASS —'), expected === 0);
      assert.equal(result.output.includes('ERROR — SECURITY AUDIT INCOMPLETE'), expected === 2);
      assert.equal(result.output.includes('FAIL — SECURITY ADVISORIES DETECTED'), expected === 1);
    });
  }
  it('CLI strict policy blocks moderate findings', () => {
    const result = invoke({ status: 1, stdout: JSON.stringify(report(['moderate'])) }, [
      '--strict',
    ]);
    assert.equal(result.status, 1);
    assert.match(result.output, /\[MODERATE\]/);
    assert.doesNotMatch(result.output, /Isolated to devDependencies|0 production runtime impact/);
  });
  for (const native of ['timeout', 'missing']) {
    it(`actual subprocess ${native} fails closed at the CLI`, () => {
      const result = invoke({ native });
      assert.equal(result.status, 2, result.output);
      assert.match(result.output, /ERROR — SECURITY AUDIT INCOMPLETE/);
      assert.doesNotMatch(result.output, /PASS —/);
    });
  }
  for (const [name, response, expected] of [
    ['clean', { status: 0, stdout: JSON.stringify(report()) }, 0],
    ['vulnerable', { status: 1, stdout: JSON.stringify(report(['high'])) }, 1],
    ['incomplete', { status: 1, stdout: '{"error":{"code":"E503"}}' }, 2],
  ]) {
    it(`npm run audit:deps propagates ${name} status ${expected}`, () => {
      const result = spawnSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'audit:deps'],
        {
          cwd: root,
          shell: process.platform === 'win32',
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            NODE_OPTIONS: `--import=${preload}`,
            TEST_AUDIT_RESPONSE: JSON.stringify(response),
          },
        }
      );
      assert.ifError(result.error);
      assert.equal(result.status, expected, result.stdout + result.stderr);
      assert.equal((result.stdout + result.stderr).includes('PASS —'), expected === 0);
    });
  }
  it('does not print sensitive npm errors, stdout, stderr or credentials', () => {
    const marker = 'PRIVATE_DIAGNOSTIC_CANARY';
    const result = invoke({
      status: 1,
      stdout: JSON.stringify({ error: { summary: `https://user:${marker}@registry.invalid/` } }),
      stderr: `Authorization: Bearer ${marker}`,
    });
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.output, new RegExp(marker));
    assert.doesNotMatch(result.output, /registry\.invalid|Authorization:|user:/);
  });
  it('bounds subprocess execution and audits the full lockfile without shell interpolation', () => {
    const actual = runNpmAudit({
      execute(command, options) {
        assert.equal(command, AUDIT_COMMAND);
        assert.match(command, /--package-lock-only/);
        assert.match(command, /--include=dev --include=optional --include=peer/);
        assert.equal(options.timeout, AUDIT_TIMEOUT_MS);
        assert.equal(options.windowsHide, true);
        assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
        return JSON.stringify(report());
      },
    });
    assert.equal(actual.metadata.vulnerabilities.total, 0);
  });
  it('rejects unknown CLI arguments instead of ignoring policy typos', () => {
    assert.equal(invoke({ status: 0, stdout: JSON.stringify(report()) }, ['--strcit']).status, 2);
  });
  it('unexpected exceptions fail closed without exposing their message', () => {
    const output = [];
    assert.equal(
      runAuditCli({
        args: [],
        execute: () => {
          throw new Error('PRIVATE');
        },
        log: (s) => output.push(s),
        error: (s) => output.push(s),
      }),
      2
    );
    assert.doesNotMatch(output.join('\n'), /PRIVATE/);
  });
  it('library subprocess path accepts completed vulnerability exit status 1', () => {
    assert.equal(
      runNpmAudit({ execute: controlled({ status: 1, stdout: JSON.stringify(report(['high'])) }) })
        .metadata.vulnerabilities.high,
      1
    );
  });
});

describe('ISSUE-13: security gate wiring', () => {
  it('npm audit script propagates the wrapper status without suppression', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    );
    assert.equal(manifest.scripts['audit:deps'], 'node scripts/audit-dependencies.js');
  });
  it('CI has an independent blocking reproducible dependency-security job', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );
    const job = workflow.split('  dependency-security:')[1]?.split('\n  verify:')[0];
    assert.ok(job, 'independent audit gate must not be skipped by existing lint failures');
    assert.match(job, /run: npm ci --ignore-scripts --no-audit/);
    assert.match(job, /run: npm run audit:deps/);
    assert.doesNotMatch(job, /continue-on-error|\|\|\s*true|allow-failure/);
  });
});

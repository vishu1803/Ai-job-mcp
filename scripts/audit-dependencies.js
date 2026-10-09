/** Fail-closed npm audit gate. Default: block high/critical; --strict also blocks moderate. */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AUDIT_COMMAND =
  'npm audit --json --package-lock-only --include=dev --include=optional --include=peer --audit-level=low';
export const AUDIT_TIMEOUT_MS = 60000;
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

export class AuditIncompleteError extends Error {
  constructor(reason) {
    // Only server-authored reason codes: never echo npm output, URLs, credentials or exception text.
    super(`ERROR — SECURITY AUDIT INCOMPLETE (${reason})`);
    this.name = 'AuditIncompleteError';
    this.code = reason;
    this.exitCode = 2;
  }
}

/** Accept npm's v2 report, not merely parseable JSON. Counts must agree with findings. */
export function validateAuditReport(report) {
  if (!isObject(report) || Object.hasOwn(report, 'error')) {
    throw new AuditIncompleteError('NPM_ERROR_OR_INVALID_REPORT');
  }
  const counts = report.metadata?.vulnerabilities;
  if (
    report.auditReportVersion !== 2 ||
    !isObject(report.vulnerabilities) ||
    !isObject(counts) ||
    !isObject(report.metadata?.dependencies) ||
    !isCount(report.metadata.dependencies.total) ||
    ![...SEVERITIES, 'total'].every((severity) => isCount(counts[severity]))
  ) {
    throw new AuditIncompleteError('UNEXPECTED_REPORT_SCHEMA');
  }
  const observed = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (
      !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) ||
      name.length > 214 ||
      !isObject(finding) ||
      finding.name !== name ||
      !SEVERITIES.includes(finding.severity) ||
      typeof finding.isDirect !== 'boolean' ||
      typeof finding.range !== 'string' ||
      !Array.isArray(finding.via) ||
      finding.via.length === 0 ||
      !finding.via.every(
        (via) =>
          (typeof via === 'string' && via.length > 0) ||
          (isObject(via) &&
            typeof via.name === 'string' &&
            typeof via.title === 'string' &&
            SEVERITIES.includes(via.severity) &&
            SEVERITIES.indexOf(via.severity) <= SEVERITIES.indexOf(finding.severity))
      ) ||
      !Array.isArray(finding.effects) ||
      !finding.effects.every((effect) => typeof effect === 'string') ||
      !Array.isArray(finding.nodes) ||
      finding.nodes.length === 0 ||
      !finding.nodes.every((node) => typeof node === 'string' && node.length > 0) ||
      !(
        typeof finding.fixAvailable === 'boolean' ||
        (isObject(finding.fixAvailable) &&
          typeof finding.fixAvailable.name === 'string' &&
          typeof finding.fixAvailable.version === 'string' &&
          typeof finding.fixAvailable.isSemVerMajor === 'boolean')
      )
    ) {
      throw new AuditIncompleteError('INCOMPLETE_FINDING');
    }
    observed[finding.severity] += 1;
  }
  if (
    !SEVERITIES.every((severity) => counts[severity] === observed[severity]) ||
    counts.total !== SEVERITIES.reduce((sum, severity) => sum + counts[severity], 0) ||
    report.metadata.dependencies.total < counts.total
  ) {
    throw new AuditIncompleteError('INCONSISTENT_FINDING_COUNTS');
  }
  return report;
}

/** Nonzero npm status 1 may be a completed vulnerability report. All other failures close the gate. */
export function runNpmAudit(options = {}) {
  const { execute = execSync, cwd = process.cwd(), timeoutMs = AUDIT_TIMEOUT_MS } = options;
  let stdout;
  let status = 0;
  try {
    stdout = execute(AUDIT_COMMAND, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    if (error.code || error.signal || error.status !== 1) {
      throw new AuditIncompleteError('SUBPROCESS_FAILED_OR_TERMINATED');
    }
    status = error.status;
    stdout = error.stdout;
  }
  if (typeof stdout !== 'string' || !stdout.trim()) {
    throw new AuditIncompleteError('EMPTY_AUDIT_OUTPUT');
  }
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new AuditIncompleteError('MALFORMED_AUDIT_JSON');
  }
  validateAuditReport(report);
  if (status === 1 && report.metadata.vulnerabilities.total === 0) {
    throw new AuditIncompleteError('NONZERO_WITHOUT_FINDINGS');
  }
  return report;
}

export function evaluateAudit(report, options = {}) {
  validateAuditReport(report);
  const findings = Object.entries(report.vulnerabilities).map(([name, finding]) => ({
    package: name,
    ...finding,
  }));
  const criticalHighFindings = findings.filter((finding) =>
    ['critical', 'high'].includes(finding.severity)
  );
  const moderateFindings = findings.filter((finding) => finding.severity === 'moderate');
  const passed =
    criticalHighFindings.length === 0 && (!options.strict || moderateFindings.length === 0);
  return {
    passed,
    outcome: passed ? 'PASS' : 'FAIL_VULNERABILITIES',
    exitCode: passed ? 0 : 1,
    summary: report.metadata.vulnerabilities,
    findings,
    criticalHighFindings,
    moderateFindings,
  };
}

export function runAuditCli(options = {}) {
  const { args = process.argv.slice(2), log = console.log, error = console.error } = options;
  try {
    if (args.some((arg) => arg !== '--strict')) throw new AuditIncompleteError('INVALID_ARGUMENT');
    log('Auditing package-lock.json (all dependency types; registry access required).');
    const report = runNpmAudit(options);
    const result = evaluateAudit(report, { strict: args.includes('--strict') });
    log(`Vulnerability counts: ${JSON.stringify(result.summary)}`);
    for (const finding of result.findings) {
      // Do not print arbitrary advisory prose, registry URLs, npm diagnostics or subprocess commands.
      log(
        `[${finding.severity.toUpperCase()}] ${finding.package}; direct=${finding.isDirect}; fixAvailable=${Boolean(finding.fixAvailable)}`
      );
    }
    log(
      result.passed
        ? 'PASS — SECURITY AUDIT CLEAN (no findings prohibited by the configured policy).'
        : 'FAIL — SECURITY ADVISORIES DETECTED'
    );
    return result.exitCode;
  } catch (failure) {
    error(
      failure instanceof AuditIncompleteError
        ? failure.message
        : 'ERROR — SECURITY AUDIT INCOMPLETE (UNEXPECTED_FAILURE)'
    );
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runAuditCli();
}

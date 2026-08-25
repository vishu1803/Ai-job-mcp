/**
 * @file Deterministic Benchmark Statistics and Regression Evaluation Utilities (P8-006)
 *
 * Implements standard, mathematically rigorous statistical calculations:
 * - Percentiles (p50 / median, p95, p99) via linear interpolation / nearest-rank.
 * - Arithmetic Mean and Sample Standard Deviation.
 * - Min, Max, and Error Rate.
 * - Regression Evaluation against SLA budgets and baseline thresholds.
 *
 * Zero external dependencies. Fully deterministic and pure.
 */

/**
 * Computes the arithmetic mean of an array of numeric values.
 *
 * @param {number[]} values Array of numeric samples.
 * @returns {number} Arithmetic mean, or 0 if array is empty.
 */
export function computeMean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sum = values.reduce(
    (acc, val) => acc + (typeof val === 'number' && !Number.isNaN(val) ? val : 0),
    0
  );
  return sum / values.length;
}

/**
 * Computes the sample standard deviation of an array of numeric values.
 *
 * @param {number[]} values Array of numeric samples.
 * @param {number} [mean] Optional precomputed arithmetic mean.
 * @returns {number} Sample standard deviation, or 0 if length < 2.
 */
export function computeStdDev(values, mean = null) {
  if (!Array.isArray(values) || values.length <= 1) return 0;
  const avg = mean !== null ? mean : computeMean(values);
  const variance =
    values.reduce((acc, val) => {
      const num = typeof val === 'number' && !Number.isNaN(val) ? val : 0;
      return acc + Math.pow(num - avg, 2);
    }, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Computes a specific percentile (0-100) from an array of numeric samples
 * using linear interpolation between nearest ranks (standard NIST / Excel method).
 *
 * @param {number[]} values Array of numeric samples.
 * @param {number} percentile Percentile to compute (e.g. 50, 95, 99).
 * @returns {number} Computed percentile value, or 0 if empty.
 */
export function computePercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (percentile <= 0) return Math.min(...values);
  if (percentile >= 100) return Math.max(...values);

  // Filter valid numbers and sort ascending
  const sorted = values
    .filter((v) => typeof v === 'number' && !Number.isNaN(v))
    .sort((a, b) => a - b);

  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (percentile / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const weight = index - lowerIndex;

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/**
 * Computes min value in an array.
 *
 * @param {number[]} values Array of numeric samples.
 * @returns {number} Minimum value, or 0 if empty.
 */
export function computeMin(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const valid = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  return valid.length > 0 ? Math.min(...valid) : 0;
}

/**
 * Computes max value in an array.
 *
 * @param {number[]} values Array of numeric samples.
 * @returns {number} Maximum value, or 0 if empty.
 */
export function computeMax(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const valid = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  return valid.length > 0 ? Math.max(...valid) : 0;
}

/**
 * Computes error rate percentage from error count and total requests.
 *
 * @param {number} errorCount Number of failed requests.
 * @param {number} totalRequests Total requests attempted.
 * @returns {number} Error rate percentage (0.0 to 100.0).
 */
export function computeErrorRate(errorCount, totalRequests) {
  if (!totalRequests || totalRequests <= 0) return 0;
  return Number(((errorCount / totalRequests) * 100).toFixed(2));
}

/**
 * Approved Tool-Specific p95 Targets (ARCH-030 / ADR-051)
 */
export const TOOL_P95_TARGETS = Object.freeze({
  get_candidate_profile: 350,
  list_verified_skills: 300,
  inspect_project_evidence: 350,
  analyze_job_fit: 650,
  recommend_portfolio_projects: 750,
  generate_tailored_resume: 950,
  draft_cover_letter: 850,
});

/** Global Maximum SLA Ceiling for MCP_HTTP p95 across all tools */
export const GLOBAL_P95_SLA_CEILING_MS = 1500;

/** Maximum Permitted p95 Regression Factor against Baseline */
export const MAX_BASELINE_REGRESSION_FACTOR = 1.25;

/**
 * Evaluates benchmark results against regression thresholds and SLA targets.
 *
 * Rules:
 * 1. FAIL if errorRate > 0.0%
 * 2. FAIL if p95 > 1500ms (GLOBAL_P95_SLA_CEILING_MS)
 * 3. FAIL if p95 > 1.25 * baseline.p95 (MAX_BASELINE_REGRESSION_FACTOR)
 * 4. WARN if p95 > toolSpecificTarget
 * 5. PASS otherwise
 *
 * @param {object} params Evaluation parameters
 * @param {string} params.tool Tool name
 * @param {number} params.p95Ms Measured p95 in milliseconds
 * @param {number} params.errorRate Measured error rate percentage
 * @param {object} [params.baseline] Stored baseline result for comparison
 * @param {number} [params.baseline.p95Ms] Baseline p95 in milliseconds
 * @returns {object} Evaluation result { status: 'PASS'|'FAIL'|'WARN', reasons: string[], targetMs: number, toolDeviationMs: number }
 */
export function evaluateRegression({ tool, p95Ms, errorRate, baseline = null }) {
  const reasons = [];
  let status = 'PASS';

  const toolTarget = TOOL_P95_TARGETS[tool] || GLOBAL_P95_SLA_CEILING_MS;

  // Rule 1: Error rate must be 0%
  if (errorRate > 0) {
    status = 'FAIL';
    reasons.push(`Error rate ${errorRate}% exceeds 0.0% tolerance.`);
  }

  // Rule 2: Global SLA ceiling (1500ms)
  if (p95Ms > GLOBAL_P95_SLA_CEILING_MS) {
    status = 'FAIL';
    reasons.push(`p95 (${p95Ms.toFixed(1)}ms) exceeds the 1500ms global MCP_HTTP SLA ceiling.`);
  }

  // Rule 3: Baseline regression check (25% degradation ceiling)
  if (baseline && typeof baseline.p95Ms === 'number' && baseline.p95Ms > 0) {
    const maxAllowed = baseline.p95Ms * MAX_BASELINE_REGRESSION_FACTOR;
    if (p95Ms > maxAllowed) {
      status = 'FAIL';
      reasons.push(
        `p95 (${p95Ms.toFixed(1)}ms) degraded by >25% against baseline (${baseline.p95Ms.toFixed(1)}ms, max allowed: ${maxAllowed.toFixed(1)}ms).`
      );
    }
  }

  // Rule 4: Tool-specific target check (informational/warning if under 1500ms but over tool budget)
  const toolDeviationMs = p95Ms - toolTarget;
  if (p95Ms > toolTarget && status !== 'FAIL') {
    status = 'WARN';
    reasons.push(
      `p95 (${p95Ms.toFixed(1)}ms) exceeds tool-specific target (${toolTarget}ms) by ${toolDeviationMs.toFixed(1)}ms.`
    );
  }

  return {
    tool,
    status,
    reasons,
    targetMs: toolTarget,
    toolDeviationMs: Number(toolDeviationMs.toFixed(1)),
  };
}

/**
 * Summarizes an array of raw latency measurements into a standard statistical distribution object.
 *
 * @param {number[]} latencies Array of latency values in milliseconds.
 * @param {number} [errorCount=0] Number of errored requests.
 * @returns {object} Distribution summary { minMs, maxMs, meanMs, p50Ms, p95Ms, p99Ms, stddevMs, errorRate }
 */
export function summarizeDistribution(latencies, errorCount = 0) {
  const total = (latencies?.length || 0) + errorCount;
  const mean = computeMean(latencies);
  return {
    count: latencies?.length || 0,
    totalRequests: total,
    minMs: Number(computeMin(latencies).toFixed(2)),
    maxMs: Number(computeMax(latencies).toFixed(2)),
    meanMs: Number(mean.toFixed(2)),
    p50Ms: Number(computePercentile(latencies, 50).toFixed(2)),
    p95Ms: Number(computePercentile(latencies, 95).toFixed(2)),
    p99Ms: Number(computePercentile(latencies, 99).toFixed(2)),
    stddevMs: Number(computeStdDev(latencies, mean).toFixed(2)),
    errorRate: computeErrorRate(errorCount, total),
  };
}

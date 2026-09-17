/**
 * @file Score Calibration Benchmark & Correlation Framework
 *
 * Provides statistical calibration tools to compare engine scores against
 * human review benchmarks:
 * - Spearman's rank correlation coefficient (rho)
 * - Pearson linear correlation coefficient (r)
 * - False-positive and false-negative rate calculation
 * - Rank monotonicity verification
 */

/**
 * Computes Spearman's rank correlation coefficient between two arrays of numbers.
 * @param {Array<number>} x Array of engine scores or ranks
 * @param {Array<number>} y Array of benchmark scores or ranks
 * @returns {number} Spearman rho (-1.0 to 1.0)
 */
export function calculateSpearmanRankCorrelation(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) {
    throw new Error('x and y must be arrays of equal length with at least 2 items');
  }

  const n = x.length;

  const toRanks = (arr) => {
    const sorted = arr
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => b.val - a.val); // Descending (higher score = rank 1)

    const ranks = new Array(n);
    for (let i = 0; i < n; i++) {
      ranks[sorted[i].idx] = i + 1;
    }
    return ranks;
  };

  const rankX = toRanks(x);
  const rankY = toRanks(y);

  let dSquaredSum = 0;
  for (let i = 0; i < n; i++) {
    const d = rankX[i] - rankY[i];
    dSquaredSum += d * d;
  }

  const rho = 1 - (6 * dSquaredSum) / (n * (n * n - 1));
  return Math.round(rho * 1000) / 1000;
}

/**
 * Computes Pearson linear correlation coefficient.
 * @param {Array<number>} x
 * @param {Array<number>} y
 * @returns {number} Pearson r (-1.0 to 1.0)
 */
export function calculatePearsonCorrelation(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) {
    throw new Error('x and y must be arrays of equal length with at least 2 items');
  }

  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0.0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/**
 * Computes false-positive and false-negative classification rates
 * against an established binary qualification threshold.
 *
 * @param {object} params
 * @param {Array<number>} params.engineScores
 * @param {Array<number>} params.benchmarkScores
 * @param {number} [params.threshold=70]
 * @returns {{ falsePositiveRate: number, falseNegativeRate: number, accuracy: number }}
 */
export function evaluateClassificationMetrics({
  engineScores,
  benchmarkScores,
  threshold = 70,
}) {
  let fp = 0;
  let fn = 0;
  let tp = 0;
  let tn = 0;

  for (let i = 0; i < engineScores.length; i++) {
    const enginePass = engineScores[i] >= threshold;
    const benchPass = benchmarkScores[i] >= threshold;

    if (enginePass && !benchPass) fp++;
    else if (!enginePass && benchPass) fn++;
    else if (enginePass && benchPass) tp++;
    else tn++;
  }

  const actualNegative = fp + tn;
  const actualPositive = tp + fn;

  const falsePositiveRate = actualNegative > 0 ? Math.round((fp / actualNegative) * 1000) / 1000 : 0.0;
  const falseNegativeRate = actualPositive > 0 ? Math.round((fn / actualPositive) * 1000) / 1000 : 0.0;
  const accuracy = Math.round(((tp + tn) / engineScores.length) * 1000) / 1000;

  return {
    falsePositiveRate,
    falseNegativeRate,
    accuracy,
    confusionMatrix: { tp, fp, fn, tn },
  };
}

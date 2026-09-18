/**
 * @file Score Calibration Benchmark & Correlation Framework (P82)
 *
 * Provides statistical calibration tools to compare engine scores against
 * human review benchmarks:
 * - Spearman's rank correlation coefficient (rho)
 * - Pearson linear correlation coefficient (r)
 * - Mean Absolute Error (MAE)
 * - Root Mean Squared Error (RMSE)
 * - False-positive and false-negative rate calculation
 * - Rank monotonicity verification
 * - Full calibration comparison suite
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
 * Computes Mean Absolute Error (MAE) between two arrays of numbers.
 * @param {Array<number>} x
 * @param {Array<number>} y
 * @returns {number}
 */
export function calculateMeanAbsoluteError(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length === 0) {
    throw new Error('x and y must be non-empty arrays of equal length');
  }
  const sumDiff = x.reduce((sum, val, idx) => sum + Math.abs(val - y[idx]), 0);
  return Math.round((sumDiff / x.length) * 1000) / 1000;
}

/**
 * Computes Root Mean Squared Error (RMSE) between two arrays of numbers.
 * @param {Array<number>} x
 * @param {Array<number>} y
 * @returns {number}
 */
export function calculateRootMeanSquaredError(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length === 0) {
    throw new Error('x and y must be non-empty arrays of equal length');
  }
  const sumSquaredDiff = x.reduce((sum, val, idx) => sum + Math.pow(val - y[idx], 2), 0);
  return Math.round(Math.sqrt(sumSquaredDiff / x.length) * 1000) / 1000;
}

/**
 * Computes false-positive and false-negative classification rates
 * against an established binary qualification threshold.
 *
 * @param {object} params
 * @param {Array<number>} params.engineScores
 * @param {Array<number>} params.benchmarkScores
 * @param {number} [params.threshold=70]
 * @returns {{ falsePositiveRate: number, falseNegativeRate: number, accuracy: number, confusionMatrix: object }}
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

/**
 * Executes a full calibration comparison between engine publishable scores and benchmark scores.
 *
 * @param {object} params
 * @param {Array<number>} params.engineScores
 * @param {Array<number>} params.benchmarkScores
 * @param {number} [params.threshold=70]
 * @returns {object} Comprehensive statistical calibration metrics
 */
export function runScoreCalibrationComparison({
  engineScores,
  benchmarkScores,
  threshold = 70,
}) {
  const spearmanRho = calculateSpearmanRankCorrelation(engineScores, benchmarkScores);
  const pearsonR = calculatePearsonCorrelation(engineScores, benchmarkScores);
  const mae = calculateMeanAbsoluteError(engineScores, benchmarkScores);
  const rmse = calculateRootMeanSquaredError(engineScores, benchmarkScores);
  const classificationMetrics = evaluateClassificationMetrics({
    engineScores,
    benchmarkScores,
    threshold,
  });

  return {
    spearmanRho,
    pearsonR,
    mae,
    rmse,
    classificationMetrics,
  };
}

/**
 * Calculates inter-rater reliability among multiple human reviewers.
 *
 * @param {object} reviewersScores Object mapping reviewerId -> Array<number> scores
 * @param {number} [threshold=70]
 * @returns {object} Pairwise and mean correlations, plus binary consensus agreement
 */
export function calculateInterRaterAgreement(reviewersScores, threshold = 70) {
  const reviewerKeys = Object.keys(reviewersScores);
  if (reviewerKeys.length < 2) {
    throw new Error('At least 2 reviewers are required to calculate inter-rater agreement');
  }

  const n = reviewersScores[reviewerKeys[0]].length;
  const pairwise = {};
  const pearsonValues = [];
  const spearmanValues = [];
  let pairCount = 0;
  let totalBinaryAgreements = 0;
  let totalPairwiseComparisons = 0;

  for (let i = 0; i < reviewerKeys.length; i++) {
    for (let j = i + 1; j < reviewerKeys.length; j++) {
      const rA = reviewerKeys[i];
      const rB = reviewerKeys[j];
      const pairKey = `${rA}_vs_${rB}`;

      const scoresA = reviewersScores[rA];
      const scoresB = reviewersScores[rB];

      const r = calculatePearsonCorrelation(scoresA, scoresB);
      const rho = calculateSpearmanRankCorrelation(scoresA, scoresB);

      pearsonValues.push(r);
      spearmanValues.push(rho);
      pairCount++;

      // Binary agreement at threshold
      let pairAgreed = 0;
      for (let k = 0; k < n; k++) {
        const passA = scoresA[k] >= threshold;
        const passB = scoresB[k] >= threshold;
        if (passA === passB) {
          pairAgreed++;
          totalBinaryAgreements++;
        }
        totalPairwiseComparisons++;
      }

      pairwise[pairKey] = {
        pearsonR: r,
        spearmanRho: rho,
        binaryAgreementRate: Math.round((pairAgreed / n) * 1000) / 1000,
      };
    }
  }

  const meanPearsonR = Math.round((pearsonValues.reduce((a, b) => a + b, 0) / pairCount) * 1000) / 1000;
  const meanSpearmanRho = Math.round((spearmanValues.reduce((a, b) => a + b, 0) / pairCount) * 1000) / 1000;
  const binaryAgreementRate = totalPairwiseComparisons > 0
    ? Math.round((totalBinaryAgreements / totalPairwiseComparisons) * 1000) / 1000
    : 1.0;

  return {
    pairwise,
    meanPearsonR,
    meanSpearmanRho,
    binaryAgreementRate,
  };
}

/**
 * Compares calibration metrics (P82) vs holdout metrics (P83) to detect generalization drift.
 *
 * @param {object} params
 * @param {object} params.calibrationMetrics
 * @param {object} params.holdoutMetrics
 * @returns {object} Delta analysis and generalization preservation boolean
 */
export function compareCalibrationVsHoldout({ calibrationMetrics, holdoutMetrics }) {
  if (!calibrationMetrics || !holdoutMetrics) {
    throw new Error('Both calibrationMetrics and holdoutMetrics must be provided');
  }

  const deltaSpearmanRho = Math.round((holdoutMetrics.spearmanRho - calibrationMetrics.spearmanRho) * 1000) / 1000;
  const deltaPearsonR = Math.round((holdoutMetrics.pearsonR - calibrationMetrics.pearsonR) * 1000) / 1000;
  const deltaMae = Math.round((holdoutMetrics.mae - calibrationMetrics.mae) * 1000) / 1000;
  const deltaRmse = Math.round((holdoutMetrics.rmse - calibrationMetrics.rmse) * 1000) / 1000;
  const deltaAccuracy = Math.round(
    (holdoutMetrics.classificationMetrics.accuracy - calibrationMetrics.classificationMetrics.accuracy) * 1000
  ) / 1000;

  // Generalization is preserved if holdout Spearman rho does not drop by more than 0.10
  // and remains in high-performance territory (>= 0.85)
  const isGeneralizationPreserved = deltaSpearmanRho >= -0.10 && holdoutMetrics.spearmanRho >= 0.85;

  return {
    deltaSpearmanRho,
    deltaPearsonR,
    deltaMae,
    deltaRmse,
    deltaAccuracy,
    isGeneralizationPreserved,
  };
}

/**
 * Evaluates the 6 formal quantitative criteria for production Go/No-Go.
 *
 * @param {object} params
 * @param {number} params.sampleCount Number of blind holdout pairs
 * @param {boolean} params.pdfProvenanceVerified Genuine PDF byte buffers evaluated
 * @param {object} params.interRaterMetrics Result of calculateInterRaterAgreement
 * @param {object} params.holdoutMetrics Result of runScoreCalibrationComparison on holdout
 * @param {object} params.generalizationComparison Result of compareCalibrationVsHoldout
 * @param {boolean} params.fraudGatingPassed 100% of fraud resumes blocked with publishableScore === 0
 * @returns {{ verdict: 'GO' | 'NO_GO', criteria: object, summary: string }}
 */
export function evaluateGoNoGoDecision({
  sampleCount,
  pdfProvenanceVerified,
  interRaterMetrics,
  holdoutMetrics,
  generalizationComparison,
  fraudGatingPassed,
}) {
  const criteria = {
    sampleSizeAndProvenance: {
      passed: sampleCount >= 30 && pdfProvenanceVerified === true,
      details: `Evaluated ${sampleCount} holdout samples (req: >= 30) with verified PDF byte provenance`,
    },
    humanAgreementBaseline: {
      passed: interRaterMetrics.meanPearsonR >= 0.80 && interRaterMetrics.binaryAgreementRate >= 0.85,
      details: `Mean r = ${interRaterMetrics.meanPearsonR} (req: >= 0.80), Agreement = ${(interRaterMetrics.binaryAgreementRate * 100).toFixed(1)}% (req: >= 85%)`,
    },
    holdoutCorrelation: {
      passed: holdoutMetrics.spearmanRho >= 0.85 && holdoutMetrics.pearsonR >= 0.82,
      details: `Spearman rho = ${holdoutMetrics.spearmanRho} (req: >= 0.85), Pearson r = ${holdoutMetrics.pearsonR} (req: >= 0.82)`,
    },
    generalizationPreserved: {
      passed: generalizationComparison.isGeneralizationPreserved === true,
      details: `Delta rho = ${generalizationComparison.deltaSpearmanRho > 0 ? '+' : ''}${generalizationComparison.deltaSpearmanRho} (|delta| <= 0.10 preserved)`,
    },
    falsePositiveSafety: {
      passed: holdoutMetrics.classificationMetrics.falsePositiveRate === 0.0,
      details: `False positive rate = ${(holdoutMetrics.classificationMetrics.falsePositiveRate * 100).toFixed(1)}% (req: 0.0%)`,
    },
    fraudIntegrityGating: {
      passed: fraudGatingPassed === true,
      details: `100% of unverified metric/fraud claims strictly blocked with publishableScore = 0`,
    },
  };

  const allPassed = Object.values(criteria).every((c) => c.passed === true);
  const verdict = allPassed ? 'GO' : 'NO_GO';

  const summary = verdict === 'GO'
    ? `DECISION: GO - All 6 empirical holdout validation criteria satisfied. Scoring policy p82.0 empirically validated.`
    : `DECISION: NO_GO - Holdout validation failed to satisfy all criteria.`;

  return {
    verdict,
    criteria,
    summary,
  };
}

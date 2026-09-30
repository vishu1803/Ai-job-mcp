/**
 * @file ATS Benchmark Metrics (Phase 17)
 *
 * Implements precision, recall, F1, and ranking correlation (NDCG)
 * for evaluating ATS intelligence and candidate matching accuracy.
 */

/**
 * Computes precision, recall, and F1 score for set retrieval / classification.
 *
 * @param {Array<string>} retrieved Set of retrieved/extracted items
 * @param {Array<string>} groundTruth Set of ground truth items
 * @returns {{ precision: number, recall: number, f1: number }}
 */
export function computeRetrievalMetrics(retrieved = [], groundTruth = []) {
  const retSet = new Set(retrieved.map((s) => String(s).toLowerCase().trim()));
  const gtSet = new Set(groundTruth.map((s) => String(s).toLowerCase().trim()));

  if (gtSet.size === 0) {
    return {
      precision: retSet.size === 0 ? 1.0 : 0.0,
      recall: 1.0,
      f1: retSet.size === 0 ? 1.0 : 0.0,
    };
  }

  let truePositives = 0;
  for (const item of retSet) {
    if (gtSet.has(item)) {
      truePositives++;
    }
  }

  const precision = retSet.size > 0 ? truePositives / retSet.size : 0.0;
  const recall = gtSet.size > 0 ? truePositives / gtSet.size : 0.0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;

  return {
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
  };
}

/**
 * Computes Normalized Discounted Cumulative Gain (NDCG@K) for ranking quality.
 *
 * @param {Array<number>} predictedRanks Array of ground truth relevance scores ordered by predicted rank
 * @param {Array<number>} idealRanks Array of ground truth relevance scores ordered ideally (descending)
 * @returns {number} NDCG score between 0.0 and 1.0
 */
export function computeNdcg(predictedRanks = [], idealRanks = []) {
  if (predictedRanks.length === 0 || idealRanks.length === 0) return 1.0;

  function dcg(scores) {
    return scores.reduce((sum, score, i) => {
      const rank = i + 1;
      const discount = Math.log2(rank + 1);
      return sum + (Math.pow(2, score) - 1) / discount;
    }, 0);
  }

  const dcgVal = dcg(predictedRanks);
  const idcgVal = dcg(idealRanks);

  if (idcgVal === 0) return 1.0;
  return Math.round((dcgVal / idcgVal) * 1000) / 1000;
}

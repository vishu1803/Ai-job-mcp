/**
 * @file Resume Professional Writing Quality Scorer Service
 *
 * Measures professional writing quality independently from ATS parseability:
 * 1. Action Verb Strength
 * 2. Accomplishment Ratio
 * 3. Technical Specificity
 * 4. Result / Purpose Coverage
 * 5. Authentic Metric Usage (reward authentic metrics when available; NEVER penalize candidates lacking metrics)
 * 6. Semantic Diversity
 * 7. Redundancy
 * 8. Generic Language / Cliché Detection
 * 9. Passive Voice
 * 10. Verbosity & Conciseness
 * 11. Job Relevance
 * 12. Evidence Traceability
 */

// Strong active engineering verbs
const STRONG_ACTION_VERBS = new Set([
  'architected', 'engineered', 'implemented', 'designed', 'built', 'developed',
  'optimized', 'automated', 'orchestrated', 'spearheaded', 'refactored', 'deployed',
  'containerized', 'configured', 'integrated', 'migrated', 'scaled', 'benchmarked',
  'debugged', 'reduced', 'eliminated', 'standardized', 'secured', 'streamlined',
  'published', 'authored', 'established', 'maintained', 'analyzed', 'profiled',
]);

const WEAK_VERB_PATTERNS = [
  /\b(worked on|helped with|responsible for|assisted with|handled|contributed to|involved in|did|made)\b/i,
];

const GENERIC_CLICHE_PATTERNS = [
  /\b(results?-driven|detail-oriented|team player|hard-working|hard working|fast learner|go-getter|outside the box|synerg\w+|thought leader|passionate developer|self-starter|dynamic professional)\b/i,
];

const PASSIVE_VOICE_PATTERNS = [
  /\b(was|were|is|are|been|being)\s+(developed|created|built|written|managed|implemented|designed|handled|tested)\b/i,
  /\b(responsible for|tasked with)\b/i,
];

const RESULT_PURPOSE_MARKERS = [
  /\b(to\s+(?:ensure|reduce|improve|enable|prevent|scale|support|streamline|accelerate|mitigate|achieve))\b/i,
  /\b(resulting in|yielding|reducing|improving|enabling|achieving|increasing|saving)\b/i,
  /\b(for\s+(?:high|improved|seamless|reliable|deterministic|low-latency))\b/i,
  /\b(with\s+(?:zero|sub-|\d+|minimal))\b/i,
];

/**
 * Evaluates the writing quality of a structured resume across 12 dimensions.
 *
 * @param {object} params
 * @param {object} params.structuredResume - The structured resume document or snapshot
 * @param {object} [params.jobPosting] - Optional target job posting for relevance scoring
 * @param {object} [params.factInventory] - Optional canonical fact inventory for evidence traceability
 * @returns {object} Detailed writing quality report with scores and findings
 */
export function evaluateResumeWritingQuality({
  structuredResume,
  jobPosting = null,
  factInventory = null,
}) {
  const doc = structuredResume?.structuredResume || structuredResume || {};
  const projects = doc.projects || [];
  const experiences = doc.experience || [];
  const summary = doc.summary?.text || (typeof doc.summary === 'string' ? doc.summary : '') || '';

  // Collect all bullets
  const projectBullets = [];
  for (const p of projects) {
    for (const b of (p.bullets || [])) {
      const text = typeof b === 'string' ? b : b.text;
      if (text) {
        projectBullets.push({
          text,
          ownerType: 'project',
          ownerName: p.name || p.projectId,
          evidenceRefs: b.evidenceRefs || [],
          composedFromFactIds: b.composedFromFactIds || [],
          semanticDimensions: b.semanticDimensions || [],
        });
      }
    }
  }

  const experienceBullets = [];
  for (const e of experiences) {
    for (const b of (e.bullets || [])) {
      const text = typeof b === 'string' ? b : b.text;
      if (text) {
        experienceBullets.push({
          text,
          ownerType: 'experience',
          ownerName: e.company || e.title || 'Role',
          evidenceRefs: b.evidenceRefs || [],
          composedFromFactIds: b.composedFromFactIds || [],
        });
      }
    }
  }

  const allBullets = [...projectBullets, ...experienceBullets];
  const totalBullets = allBullets.length;

  if (totalBullets === 0) {
    return {
      writingQualityScore: 50,
      dimensions: {},
      findings: [{ code: 'NO_BULLETS', severity: 'WARN', message: 'No bullets found to evaluate' }],
      strengths: [],
      recommendations: ['Add evidence-backed project or experience bullets'],
    };
  }

  const findings = [];
  const strengths = [];
  const recommendations = [];

  // 1. Action Verb Strength
  let strongVerbCount = 0;
  let weakVerbCount = 0;
  for (const b of allBullets) {
    const firstWord = (b.text.trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (STRONG_ACTION_VERBS.has(firstWord)) {
      strongVerbCount++;
    } else if (WEAK_VERB_PATTERNS.some((p) => p.test(b.text.slice(0, 30)))) {
      weakVerbCount++;
    }
  }
  const actionVerbRatio = strongVerbCount / totalBullets;
  const actionVerbStrength = Math.round(Math.min(100, Math.max(30, (actionVerbRatio * 80) + 20 - (weakVerbCount * 15))));
  if (actionVerbRatio >= 0.75) strengths.push('Strong action verb usage across bullet openers');
  if (weakVerbCount > 0) findings.push({ code: 'WEAK_VERB', severity: 'WARN', message: `Found ${weakVerbCount} bullet(s) using passive/weak verb openers` });

  // 2. Accomplishment Ratio
  // Bullets that articulate what was built/engineered + technical method
  let accomplishmentCount = 0;
  for (const b of allBullets) {
    const hasTechnicalMethod = /\b(using|via|with|by|through|leveraging|incorporating)\b/i.test(b.text);
    const hasAction = STRONG_ACTION_VERBS.has((b.text.trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, ''));
    if (hasAction && hasTechnicalMethod) {
      accomplishmentCount++;
    }
  }
  const accomplishmentRatio = Math.round((accomplishmentCount / totalBullets) * 100);
  if (accomplishmentRatio >= 50) strengths.push('High ratio of accomplishment-oriented bullets with technical methods');

  // 3. Technical Specificity
  // Proportion of bullets containing concrete technical keywords (capitalized tech, libraries, protocols)
  const TECH_PATTERN = /\b(Rust|Go|Golang|Python|TypeScript|JavaScript|Node\.js|React|PostgreSQL|Docker|Kubernetes|Raft|Kafka|gRPC|Redis|GraphQL|CI\/CD|Tailwind|FastAPI|Linux|AWS|GCP|SQL|Git|OAuth|REST|TCP|HTTP|WebSockets|Microservices|ETL|Prometheus|Grafana|SSTables?|WAL|Lua|Chaos Mesh|TimescaleDB|Airflow|Snowflake|dbt|Spark|PyTorch|TensorFlow|HuggingFace)\b/i;
  let specificCount = 0;
  for (const b of allBullets) {
    if (TECH_PATTERN.test(b.text)) specificCount++;
  }
  const technicalSpecificity = Math.round(Math.min(100, (specificCount / totalBullets) * 100));
  if (technicalSpecificity >= 70) strengths.push('High technical specificity naming concrete tools and architectures');

  // 4. Result / Purpose Coverage
  let resultCount = 0;
  for (const b of allBullets) {
    if (RESULT_PURPOSE_MARKERS.some((p) => p.test(b.text))) resultCount++;
  }
  const resultCoverage = Math.round(Math.min(100, (resultCount / totalBullets) * 100));

  // 5. Authentic Metric Usage
  // INVARIANT: Do NOT penalize a candidate merely because they lack metrics. Reward authentic metrics only when available.
  const METRIC_PATTERN = /\b(\d+(?:\.\d+)?%|\d+ms|\d+x|\d+\+?\s*(?:users|qps|rps|requests|queries|stars|commits))\b/i;
  let bulletsWithMetrics = 0;
  for (const b of allBullets) {
    if (METRIC_PATTERN.test(b.text)) bulletsWithMetrics++;
  }

  // Check if candidate source had authentic metrics
  const candidateHasMetrics = factInventory
    ? factInventory.facts.some((f) => f.metrics && Object.keys(f.metrics).length > 0)
    : false;

  let authenticMetricScore = 85; // neutral baseline
  if (candidateHasMetrics) {
    if (bulletsWithMetrics > 0) {
      authenticMetricScore = 95;
      strengths.push('Authentic quantitative metrics utilized effectively');
    } else {
      authenticMetricScore = 75; // had authentic metrics but didn't highlight any
    }
  } else {
    // No authentic metrics available in source: neutral 85, no penalty
    authenticMetricScore = 85;
  }

  // 6. Semantic Diversity & Redundancy
  // Check opener diversity and duplicate phrasing
  const openers = allBullets.map((b) => (b.text.trim().split(/\s+/)[0] || '').toLowerCase());
  const openerCounts = {};
  for (const o of openers) {
    openerCounts[o] = (openerCounts[o] || 0) + 1;
  }
  const maxRepeatedOpener = Math.max(...Object.values(openerCounts), 0);
  const openerDiversityPenalty = maxRepeatedOpener > 3 ? (maxRepeatedOpener - 3) * 8 : 0;

  // Exact or near-duplicate phrases
  let redundantPairCount = 0;
  for (let i = 0; i < allBullets.length; i++) {
    for (let j = i + 1; j < allBullets.length; j++) {
      const wordsA = new Set(allBullets[i].text.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
      const wordsB = new Set(allBullets[j].text.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
      const intersection = [...wordsA].filter((w) => wordsB.has(w));
      const jaccard = intersection.length / Math.max(1, (wordsA.size + wordsB.size - intersection.length));
      if (jaccard > 0.65) {
        redundantPairCount++;
      }
    }
  }

  const redundancyScore = Math.max(20, 100 - (redundantPairCount * 25) - openerDiversityPenalty);
  const semanticDiversity = Math.max(25, 100 - (redundantPairCount * 20) - (openerDiversityPenalty * 1.5));
  if (redundantPairCount > 0) {
    findings.push({ code: 'SEMANTIC_REDUNDANCY', severity: 'WARN', message: `Found ${redundantPairCount} semantically overlapping bullet pairs` });
  }

  // 7. Generic Language / Cliché Detection
  let genericCount = 0;
  for (const b of allBullets) {
    if (GENERIC_CLICHE_PATTERNS.some((p) => p.test(b.text))) genericCount++;
  }
  if (GENERIC_CLICHE_PATTERNS.some((p) => p.test(summary))) genericCount++;
  const genericLanguageScore = Math.max(20, 100 - (genericCount * 30));
  if (genericCount > 0) {
    findings.push({ code: 'CLICHE_DETECTED', severity: 'WARN', message: `Detected ${genericCount} generic resume clichés` });
  }

  // 8. Passive Voice
  let passiveCount = 0;
  for (const b of allBullets) {
    if (PASSIVE_VOICE_PATTERNS.some((p) => p.test(b.text))) passiveCount++;
  }
  const passiveVoiceScore = Math.max(20, 100 - (passiveCount * 25));

  // 9. Verbosity & Conciseness
  let tooLong = 0;
  let tooShort = 0;
  for (const b of allBullets) {
    const len = b.text.length;
    if (len > 240) tooLong++;
    if (len < 35) tooShort++;
  }
  const verbosityScore = Math.max(30, 100 - (tooLong * 20) - (tooShort * 15));

  // 10. Job Relevance
  let jobRelevanceScore = 80;
  if (jobPosting?.requirements && Array.isArray(jobPosting.requirements)) {
    const reqKeywords = jobPosting.requirements.map((r) => String(r.keyword || r.title || '').toLowerCase()).filter(Boolean);
    if (reqKeywords.length > 0) {
      let matchedReqs = 0;
      const fullText = (summary + ' ' + allBullets.map((b) => b.text).join(' ')).toLowerCase();
      for (const kw of reqKeywords) {
        if (fullText.includes(kw)) matchedReqs++;
      }
      jobRelevanceScore = Math.round(Math.min(100, (matchedReqs / reqKeywords.length) * 100));
    }
  }

  // 11. Evidence Traceability
  let tracedBullets = 0;
  for (const b of allBullets) {
    if ((b.evidenceRefs && b.evidenceRefs.length > 0) || (b.composedFromFactIds && b.composedFromFactIds.length > 0)) {
      tracedBullets++;
    }
  }
  const evidenceTraceability = Math.round(Math.min(100, (tracedBullets / totalBullets) * 100));

  // Summary Quality Check
  const summaryLength = summary.length;
  const summarySentenceCount = (summary.match(/[^.!?]+[.!?]+/g) || []).length;
  const summaryGrounded = summaryLength > 40 && summarySentenceCount >= 1 && summarySentenceCount <= 4;

  const dimensions = {
    actionVerbStrength,
    accomplishmentRatio,
    technicalSpecificity,
    resultCoverage,
    authenticMetricUsage: authenticMetricScore,
    semanticDiversity: Math.round(semanticDiversity),
    redundancy: Math.round(redundancyScore),
    genericLanguage: genericLanguageScore,
    passiveVoice: passiveVoiceScore,
    verbosity: verbosityScore,
    jobRelevance: jobRelevanceScore,
    evidenceTraceability,
    summaryQuality: summaryGrounded ? 90 : 60,
  };

  // Weighted composite score
  const writingQualityScore = Math.round(
    actionVerbStrength * 0.12 +
    accomplishmentRatio * 0.12 +
    technicalSpecificity * 0.14 +
    resultCoverage * 0.08 +
    authenticMetricScore * 0.08 +
    dimensions.semanticDiversity * 0.10 +
    dimensions.redundancy * 0.10 +
    genericLanguageScore * 0.06 +
    passiveVoiceScore * 0.06 +
    verbosityScore * 0.04 +
    jobRelevanceScore * 0.05 +
    evidenceTraceability * 0.05
  );

  return {
    writingQualityScore,
    dimensions,
    findings,
    strengths,
    recommendations,
    totalBulletsEvaluated: totalBullets,
  };
}

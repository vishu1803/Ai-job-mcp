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

import { CATEGORY_MAP } from '../utils/technology-taxonomy.js';
import { CANONICAL_TECH_MAP } from '../utils/technology-normalizer.js';
import { defaultAtsParseabilityService } from './resume-ats-parseability.service.js';
import {
  computeFactUtilizationStats,
  OMISSION_REASONS,
} from './candidate-fact-inventory.service.js';
import { calculateFactSemanticOverlap } from './resume-composition-primitives.js';

// Strong active engineering verbs
const STRONG_ACTION_VERBS = new Set([
  'architected',
  'engineered',
  'implemented',
  'designed',
  'built',
  'developed',
  'optimized',
  'automated',
  'orchestrated',
  'spearheaded',
  'refactored',
  'deployed',
  'containerized',
  'configured',
  'integrated',
  'migrated',
  'scaled',
  'benchmarked',
  'debugged',
  'reduced',
  'eliminated',
  'standardized',
  'secured',
  'streamlined',
  'published',
  'authored',
  'established',
  'maintained',
  'analyzed',
  'profiled',
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
    for (const b of p.bullets || []) {
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
    for (const b of e.bullets || []) {
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
  const actionVerbStrength = Math.round(
    Math.min(100, Math.max(30, actionVerbRatio * 80 + 20 - weakVerbCount * 15))
  );
  if (actionVerbRatio >= 0.75) strengths.push('Strong action verb usage across bullet openers');
  if (weakVerbCount > 0)
    findings.push({
      code: 'WEAK_VERB',
      severity: 'WARN',
      message: `Found ${weakVerbCount} bullet(s) using passive/weak verb openers`,
    });

  // 2. Accomplishment Ratio
  // Bullets that articulate what was built/engineered + technical method
  let accomplishmentCount = 0;
  for (const b of allBullets) {
    const hasTechnicalMethod = /\b(using|via|with|by|through|leveraging|incorporating)\b/i.test(
      b.text
    );
    const hasAction = STRONG_ACTION_VERBS.has(
      (b.text.trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, '')
    );
    if (hasAction && hasTechnicalMethod) {
      accomplishmentCount++;
    }
  }
  const accomplishmentRatio = Math.round((accomplishmentCount / totalBullets) * 100);
  if (accomplishmentRatio >= 50)
    strengths.push('High ratio of accomplishment-oriented bullets with technical methods');

  // 2b. Candidate Contribution vs Description-Only Detection
  const DESCRIPTION_OPENERS =
    /^(an?|the|this)\s+(application|system|service|platform|project|tool|engine|database|api|dashboard|library|framework)\b/i;
  const PASSIVE_DESCRIPTIONS =
    /\b(features\s+include|supports\s+both|provides\s+capabilities|designed\s+to\s+be)\b/i;

  let descriptionOnlyCount = 0;
  let candidateContributionCount = 0;
  let totalNarrativeParScore = 0;

  for (const b of allBullets) {
    const textTrimmed = b.text.trim();
    const firstWord = (textTrimmed.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    const isAction = STRONG_ACTION_VERBS.has(firstWord);
    const isDescription =
      DESCRIPTION_OPENERS.test(textTrimmed) ||
      (!isAction && PASSIVE_DESCRIPTIONS.test(textTrimmed));

    if (isDescription) {
      descriptionOnlyCount++;
    } else if (
      isAction ||
      /\b(built|engineered|architected|implemented|optimized|developed|created|scaled)\b/i.test(
        textTrimmed
      )
    ) {
      candidateContributionCount++;
    }

    // PAR completeness check: Action (25) + Object (25) + Method/Tech (25) + Purpose/Result (25)
    let parScore = 0;
    if (isAction) parScore += 25;
    if (textTrimmed.length >= 35) parScore += 25;
    if (/\b(using|via|with|by|through|leveraging|incorporating)\b/i.test(textTrimmed))
      parScore += 25;
    if (RESULT_PURPOSE_MARKERS.some((p) => p.test(textTrimmed))) parScore += 25;
    totalNarrativeParScore += parScore;
  }

  const descriptionOnlyRatio = Math.round((descriptionOnlyCount / totalBullets) * 100);
  const candidateContributionRatio = Math.round((candidateContributionCount / totalBullets) * 100);
  const narrativeCompleteness = Math.round(totalNarrativeParScore / totalBullets);

  if (descriptionOnlyCount > 0) {
    findings.push({
      code: 'DESCRIPTION_ONLY_BULLET',
      severity: 'WARN',
      message: `Found ${descriptionOnlyCount} bullet(s) that describe software rather than candidate contributions`,
    });
  }
  if (candidateContributionRatio >= 80) {
    strengths.push('High candidate contribution ratio with active engineering accomplishments');
  }

  // 3. Technical Specificity (Taxonomy-driven)
  const knownTechs = new Set(Object.keys(CATEGORY_MAP).map((k) => k.toLowerCase()));
  for (const k of Object.keys(CANONICAL_TECH_MAP)) knownTechs.add(k.toLowerCase());
  if (doc.skills?.categories) {
    for (const c of doc.skills.categories) {
      for (const s of c.skills || []) {
        const name = typeof s === 'string' ? s : s.name || s.slug;
        if (name) knownTechs.add(name.toLowerCase());
      }
    }
  }
  for (const p of projects) {
    for (const t of p.technologies || []) {
      if (t) knownTechs.add(String(t).toLowerCase());
    }
  }
  if (factInventory && Array.isArray(factInventory.facts)) {
    for (const f of factInventory.facts) {
      for (const t of f.technologies || []) {
        if (t) knownTechs.add(String(t).toLowerCase());
      }
    }
  }

  let specificCount = 0;
  for (const b of allBullets) {
    const textLower = b.text.toLowerCase();
    const words = textLower.split(/[^a-z0-9#+.]+/).filter(Boolean);
    const hasKnownTech =
      words.some((w) => knownTechs.has(w)) ||
      Array.from(knownTechs).some((t) => t.length >= 3 && textLower.includes(t));
    if (hasKnownTech) specificCount++;
  }
  const technicalSpecificity = Math.round(Math.min(100, (specificCount / totalBullets) * 100));
  if (technicalSpecificity >= 70)
    strengths.push('High technical specificity naming concrete tools and architectures');

  // 4. Result / Purpose Coverage
  let resultCount = 0;
  for (const b of allBullets) {
    if (RESULT_PURPOSE_MARKERS.some((p) => p.test(b.text))) resultCount++;
  }
  const resultCoverage = Math.round(Math.min(100, (resultCount / totalBullets) * 100));

  // 5. Authentic Metric Usage
  // INVARIANT: Do NOT penalize a candidate merely because they lack metrics. Reward authentic metrics only when available.
  const METRIC_PATTERN =
    /\b(\d+(?:\.\d+)?%|\d+ms|\d+x|\d+\+?\s*(?:users|qps|rps|requests|queries|stars|commits))\b/i;
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
      const wordsA = new Set(
        allBullets[i].text
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 4)
      );
      const wordsB = new Set(
        allBullets[j].text
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 4)
      );
      const intersection = [...wordsA].filter((w) => wordsB.has(w));
      const jaccard =
        intersection.length / Math.max(1, wordsA.size + wordsB.size - intersection.length);
      if (jaccard > 0.65) {
        redundantPairCount++;
      }
    }
  }

  const redundancyScore = Math.max(20, 100 - redundantPairCount * 25 - openerDiversityPenalty);
  const semanticDiversity = Math.max(
    25,
    100 - redundantPairCount * 20 - openerDiversityPenalty * 1.5
  );
  if (redundantPairCount > 0) {
    findings.push({
      code: 'SEMANTIC_REDUNDANCY',
      severity: 'WARN',
      message: `Found ${redundantPairCount} semantically overlapping bullet pairs`,
    });
  }

  // 7. Generic Language / Cliché Detection
  let genericCount = 0;
  for (const b of allBullets) {
    if (GENERIC_CLICHE_PATTERNS.some((p) => p.test(b.text))) genericCount++;
  }
  if (GENERIC_CLICHE_PATTERNS.some((p) => p.test(summary))) genericCount++;
  const genericLanguageScore = Math.max(20, 100 - genericCount * 30);
  if (genericCount > 0) {
    findings.push({
      code: 'CLICHE_DETECTED',
      severity: 'WARN',
      message: `Detected ${genericCount} generic resume clichés`,
    });
  }

  // 8. Passive Voice
  let passiveCount = 0;
  for (const b of allBullets) {
    if (PASSIVE_VOICE_PATTERNS.some((p) => p.test(b.text))) passiveCount++;
  }
  const passiveVoiceScore = Math.max(20, 100 - passiveCount * 25);

  // 9. Verbosity & Conciseness
  let tooLong = 0;
  let tooShort = 0;
  for (const b of allBullets) {
    const len = b.text.length;
    if (len > 240) tooLong++;
    if (len < 35) tooShort++;
  }
  const verbosityScore = Math.max(30, 100 - tooLong * 20 - tooShort * 15);

  // 10. Job Relevance & Evidence-Derived Evaluation
  let jobRelevanceScore = 80;
  let evidenceDerived = null;

  if (factInventory || jobPosting) {
    evidenceDerived = evaluateEvidenceDerivedQuality({
      structuredResume: doc,
      factInventory,
      jobPosting,
    });
    jobRelevanceScore = evidenceDerived.jobRelevanceScore;
  } else if (jobPosting?.requirements && Array.isArray(jobPosting.requirements)) {
    const reqKeywords = jobPosting.requirements
      .map((r) => String(r.keyword || r.title || '').toLowerCase())
      .filter(Boolean);
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
  const inventoryFacts =
    factInventory?.facts || (Array.isArray(factInventory) ? factInventory : []);
  for (const b of allBullets) {
    const hasRefs =
      (b.evidenceRefs && b.evidenceRefs.length > 0) ||
      (b.composedFromFactIds && b.composedFromFactIds.length > 0);
    const matchesInventory =
      inventoryFacts.length > 0 &&
      inventoryFacts.some(
        (f) =>
          calculateFactSemanticOverlap(f.text, b.text) >= 0.5 ||
          f.text.includes(b.text) ||
          b.text.includes(f.text)
      );
    if (hasRefs || matchesInventory) {
      tracedBullets++;
    }
  }
  const evidenceTraceability = Math.round(Math.min(100, (tracedBullets / totalBullets) * 100));

  // Summary Quality Check
  const summaryLength = summary.length;
  const summarySentenceCount = (summary.match(/[^.!?]+[.!?]+/g) || []).length;
  const summaryGrounded =
    summaryLength > 40 && summarySentenceCount >= 1 && summarySentenceCount <= 4;

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
    atsParseability: evidenceDerived ? evidenceDerived.atsParseabilityScore : 90,
    factUtilizationIntegrity: evidenceDerived?.factUtilization
      ? Math.round((evidenceDerived.factUtilization.utilizationRate || 0) * 100)
      : 90,
    sectionCoherence: descriptionOnlyRatio > 25 ? 70 : 95,
    descriptionOnlyRatio,
    candidateContributionRatio,
    narrativeCompleteness,
  };

  // Weighted composite score
  const writingQualityScore = Math.round(
    actionVerbStrength * 0.12 +
      accomplishmentRatio * 0.12 +
      technicalSpecificity * 0.14 +
      resultCoverage * 0.08 +
      authenticMetricScore * 0.08 +
      dimensions.semanticDiversity * 0.1 +
      dimensions.redundancy * 0.1 +
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
    evidenceDerived,
  };
}

export const OMISSION_REASON_CODES = Object.freeze({
  ...OMISSION_REASONS,
  CAPACITY_LIMIT: 'CAPACITY_LIMIT',
  PHYSICAL_CAPACITY: 'PHYSICAL_CAPACITY',
  LOW_RELEVANCE: 'LOW_RELEVANCE',
  LOW_JOB_RELEVANCE: 'LOW_JOB_RELEVANCE',
  DUPLICATE_SUPERSEDED: 'DUPLICATE_SUPERSEDED',
  ARCHETYPE_PRIORITY: 'ARCHETYPE_PRIORITY',
  ARCHETYPE_PRUNING: 'ARCHETYPE_PRUNING',
  UNSUBSTANTIATED: 'UNSUBSTANTIATED',
  UNSUBSTANTIATED_METRIC: 'UNSUBSTANTIATED_METRIC',
  LOW_EVIDENCE_CONFIDENCE: 'LOW_EVIDENCE_CONFIDENCE',
  DESCRIPTION_ONLY: 'DESCRIPTION_ONLY',
  SEMANTIC_REDUNDANCY: 'SEMANTIC_REDUNDANCY',
  CAPACITY_CEILING: 'CAPACITY_CEILING',
  SUPERSEDED_BY_RICHER_FACT: 'SUPERSEDED_BY_RICHER_FACT',
  UNSUPPORTED_ROLE_CLAIM: 'UNSUPPORTED_ROLE_CLAIM',
  UNAUTHORIZED_TECHNOLOGY: 'UNAUTHORIZED_TECHNOLOGY',
});

/**
 * Evaluates evidence-derived quality metrics:
 * - ATS parseability
 * - Exact job requirement coverage
 * - Fact utilization rate
 * - Itemized omission reasons
 *
 * @param {object} params
 * @param {object} params.structuredResume
 * @param {object} [params.factInventory]
 * @param {object} [params.jobPosting]
 * @param {object} [params.pdfObservationResult]
 * @returns {object}
 */
export function evaluateEvidenceDerivedQuality({
  structuredResume,
  factInventory = null,
  jobPosting = null,
  pdfObservationResult = null,
}) {
  const doc = structuredResume?.structuredResume || structuredResume || {};
  const inv = factInventory || null;

  const allRenderedTexts = [];
  if (doc.summary?.text) allRenderedTexts.push(doc.summary.text);
  if (Array.isArray(doc.projects)) {
    for (const p of doc.projects) {
      if (p.name) allRenderedTexts.push(p.name);
      for (const b of p.bullets || []) {
        allRenderedTexts.push(typeof b === 'string' ? b : b.text || '');
      }
    }
  }
  if (Array.isArray(doc.experience)) {
    for (const e of doc.experience) {
      if (e.company) allRenderedTexts.push(e.company);
      if (e.title) allRenderedTexts.push(e.title);
      for (const b of e.bullets || []) {
        allRenderedTexts.push(typeof b === 'string' ? b : b.text || '');
      }
    }
  }
  if (doc.skills?.categories) {
    for (const cat of doc.skills.categories) {
      for (const s of cat.skills || []) {
        allRenderedTexts.push(s.name || s.slug || '');
      }
    }
  }
  const fullDocumentText = allRenderedTexts.join(' ').toLowerCase();

  // 1. Evidence-derived ATS Parseability via AtsParseabilityService
  const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
    structuredResume: doc,
    pdfBuffer: pdfObservationResult?.pdfBuffer || null,
  });
  let atsParseabilityScore = atsResult.atsParseabilityScore;
  const atsFindings = [...atsResult.findings];

  // Check PDF observer findings if provided
  if (pdfObservationResult) {
    if (pdfObservationResult.brokenWordsCount > 0) {
      atsParseabilityScore -= Math.min(20, pdfObservationResult.brokenWordsCount * 5);
      atsFindings.push({
        code: 'ATS_BROKEN_WORDS',
        message: `Detected ${pdfObservationResult.brokenWordsCount} hyphenated or broken words`,
      });
    }
    if (pdfObservationResult.suspiciousGlyphs?.length > 0) {
      atsParseabilityScore -= Math.min(20, pdfObservationResult.suspiciousGlyphs.length * 5);
      atsFindings.push({
        code: 'ATS_SUSPICIOUS_GLYPHS',
        message: 'Detected suspicious glyphs or escape artifacts',
      });
    }
    if (pdfObservationResult.readingOrderLinearity === false) {
      atsParseabilityScore -= 15;
      atsFindings.push({
        code: 'ATS_NONLINEAR_READING',
        message: 'Reading order linearity failure',
      });
    }
  }
  atsParseabilityScore = Math.max(0, Math.min(100, Math.round(atsParseabilityScore)));

  // 2. Evidence-derived Job Relevance & Requirement Matching
  const matchedRequirements = [];
  const unmatchedRequirements = [];
  let jobRelevanceScore = 80;

  const reqKeywords = [];
  if (jobPosting?.requirements && Array.isArray(jobPosting.requirements)) {
    for (const req of jobPosting.requirements) {
      const kw = String(req.keyword || req.title || req.name || '').trim();
      if (kw) reqKeywords.push(kw);
    }
  }
  if (reqKeywords.length === 0 && jobPosting?.title) {
    const titleTokens = String(jobPosting.title)
      .split(/\s+/)
      .filter((w) => w.length > 3);
    reqKeywords.push(...titleTokens);
  }

  if (reqKeywords.length > 0) {
    let matchedCount = 0;
    for (const kw of reqKeywords) {
      const lowerKw = kw.toLowerCase();
      const isRendered = fullDocumentText.includes(lowerKw);

      const matchingFacts = inv
        ? inv.facts.filter((f) => {
            const factText = String(f.text || '').toLowerCase();
            const techMatch = (f.technologies || []).some(
              (t) => String(t).toLowerCase() === lowerKw
            );
            return factText.includes(lowerKw) || techMatch;
          })
        : [];

      if (isRendered) {
        matchedCount++;
        matchedRequirements.push({
          keyword: kw,
          status: 'RENDERED',
          matchedFactIds: matchingFacts.map((f) => f.id),
        });
      } else if (matchingFacts.length > 0) {
        matchedRequirements.push({
          keyword: kw,
          status: 'AVAILABLE_UNRENDERED',
          matchedFactIds: matchingFacts.map((f) => f.id),
        });
      } else {
        unmatchedRequirements.push({
          keyword: kw,
          status: 'NOT_IN_CANDIDATE_RECORD',
        });
      }
    }
    jobRelevanceScore = Math.round(Math.min(100, (matchedCount / reqKeywords.length) * 100));
  }

  // 3. Exact Fact Utilization
  const renderedFactIds = new Set();
  const collectFactIds = (evidenceRefs, composedFromFactIds) => {
    if (Array.isArray(composedFromFactIds)) {
      for (const id of composedFromFactIds) if (id) renderedFactIds.add(String(id));
    }
    if (Array.isArray(evidenceRefs)) {
      for (const ref of evidenceRefs) {
        const id = ref?.sourceRef || ref?.id || ref;
        if (id && typeof id === 'string') renderedFactIds.add(id);
      }
    }
  };

  if (doc.summary) {
    collectFactIds(doc.summary.evidenceRefs, doc.summary.composedFromFactIds);
  }
  if (Array.isArray(doc.projects)) {
    for (const p of doc.projects) {
      collectFactIds(p.evidenceRefs, p.composedFromFactIds);
      for (const b of p.bullets || []) {
        if (typeof b === 'object' && b !== null) {
          collectFactIds(b.evidenceRefs, b.composedFromFactIds);
        }
      }
    }
  }
  if (Array.isArray(doc.experience)) {
    for (const e of doc.experience) {
      collectFactIds(e.evidenceRefs, e.composedFromFactIds);
      for (const b of e.bullets || []) {
        if (typeof b === 'object' && b !== null) {
          collectFactIds(b.evidenceRefs, b.composedFromFactIds);
        }
      }
    }
  }

  // Cross-reference canonical fact texts against rendered document text
  if (inv && Array.isArray(inv.facts)) {
    for (const fact of inv.facts) {
      if (fact.renderable === false) continue;
      if (renderedFactIds.has(String(fact.id))) continue;

      const fText = String(fact.text || '')
        .toLowerCase()
        .trim();
      if (!fText || fText.length < 15) continue;

      if (fullDocumentText.includes(fText)) {
        renderedFactIds.add(String(fact.id));
        continue;
      }

      const factWords = fText.split(/\s+/).filter((w) => w.length > 3);
      if (factWords.length >= 3) {
        const matchedWords = factWords.filter((w) => fullDocumentText.includes(w));
        if (matchedWords.length / factWords.length >= 0.6) {
          renderedFactIds.add(String(fact.id));
        }
      }
    }
  }

  const allAvailableFacts = inv ? inv.facts.filter((f) => f.renderable !== false) : [];
  const totalAvailableFacts = allAvailableFacts.length;
  const renderedFactIdList = [...renderedFactIds];
  const unrenderedFactIdList = [];

  // 4. Omission Reasons via computeFactUtilizationStats
  const factStats = inv
    ? computeFactUtilizationStats(inv, renderedFactIds)
    : {
        factsAvailable: totalAvailableFacts,
        highValueFactsAvailable: 0,
        factsUsed: renderedFactIds.size,
        highValueFactsUsed: 0,
        factsOmitted: 0,
        factsReused: 0,
        redundantFactUse: 0,
        utilizationRate:
          totalAvailableFacts > 0
            ? parseFloat((renderedFactIds.size / totalAvailableFacts).toFixed(2))
            : 1.0,
        highValueUtilizationRate: 1.0,
        omissionReasons: {},
      };

  for (const fact of allAvailableFacts) {
    if (!renderedFactIds.has(String(fact.id))) {
      unrenderedFactIdList.push(fact.id);
    }
  }

  const omissionReasons = factStats.omissionReasons;
  const factUtilizationRate = factStats.utilizationRate;

  return {
    atsParseabilityScore,
    atsFindings,
    jobRelevanceScore,
    matchedRequirements,
    unmatchedRequirements,
    factUtilization: {
      ...factStats,
      totalAvailableFacts,
      totalRenderedFacts: renderedFactIds.size,
      utilizationRate: factUtilizationRate,
      renderedFactIds: renderedFactIdList,
      unrenderedFactIds: unrenderedFactIdList,
    },
    omissionReasons,
  };
}

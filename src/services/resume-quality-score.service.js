/**
 * @file Deterministic Resume Quality Score (P16-009).
 *
 * Computes a deterministic, content-driven professional-quality score for a
 * generated resume. Page count is a CONSTRAINT (penalty), never the objective:
 * the score rewards evidence coverage, job relevance, technical specificity,
 * accomplishment strength, semantic diversity, section completeness,
 * information density and ATS structural correctness — and penalizes
 * unsupported claims, redundancy and poor capacity utilization.
 *
 * Fully generic: operates on structured document shape, canonical facts and
 * the generic token taxonomy. No candidate/project/company/job-specific logic.
 *
 * Dimensions (spec order, weights sum to 100):
 *   1  evidenceCoverage        20
 *   2  jobRelevance            15
 *   3  technicalSpecificity    12
 *   4  accomplishmentStrength  12
 *   5  semanticDiversity       10
 *   6  sectionCompleteness      8
 *   7  informationDensity      10
 *   8  atsStructuralCorrectness 8
 *   9  unsupportedClaimRate    (penalty up to -20)
 *  10  redundancyRate          (penalty up to -15)
 *  +  pageConstraintPenalty     (penalty, max -15)
 */

import { calculateTokenOverlap } from './resume-content-strategy.service.js';

export const QUALITY_SCORE_VERSION = 'p16-009.1';

const WEIGHTS = Object.freeze({
  evidenceCoverage: 20,
  jobRelevance: 15,
  technicalSpecificity: 12,
  accomplishmentStrength: 12,
  semanticDiversity: 10,
  sectionCompleteness: 8,
  informationDensity: 10,
  atsStructuralCorrectness: 8,
});

const MAX_UNSUPPORTED_PENALTY = 20;
const MAX_REDUNDANCY_PENALTY = 15;
const MAX_PAGE_PENALTY = 15;

/** Section names (canonical renderer labels, case-insensitive match). */
const SECTION_LABELS = Object.freeze({
  SUMMARY: ['professional summary', 'summary'],
  SKILLS: ['technical skills', 'skills'],
  PROJECTS: ['technical projects', 'projects'],
  DSA: ['problem solving', 'algorithmic'],
  EXPERIENCE: ['professional experience', 'experience'],
  EDUCATION: ['education'],
  CERTIFICATIONS: ['certifications'],
});

/** Generic action/ownership verbs — taxonomy, not identity rules. */
const ACTION_VERBS = Object.freeze([
  'built', 'implemented', 'designed', 'engineered', 'developed', 'architected',
  'integrated', 'automated', 'migrated', 'optimized', 'deployed', 'delivered',
  'led', 'created', 'established', 'designed-and', 'instrumented', 'containerized',
]);

/** Generic technology/complexity signal tokens. */
const TECH_SIGNAL_TOKENS = Object.freeze([
  'distributed', 'streaming', 'queue', 'pipeline', 'cache', 'index', 'worker',
  'concurrent', 'concurrency', 'resilient', 'idempotent', 'observability',
  'telemetry', 'horizontal', 'sharding', 'replication', 'inference', 'real-time',
]);

const bulletText = (b) => (typeof b === 'string' ? b : b?.text || '');
const asList = (v) => (Array.isArray(v) ? v : []);
const clamp01 = (n) => Math.max(0, Math.min(1, n));

function mean(nums) {
  const arr = nums.filter((n) => Number.isFinite(n));
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Computes the deterministic P16-009 quality score.
 *
 * @param {object} params
 * @param {object} params.structuredResume Canonical structured resume document
 * @param {object|null} [params.candidateProfile] Canonical candidate profile (for available-fact coverage)
 * @param {object|null} [params.jobPosting] Target job posting (requirements/skills/title feed job relevance)
 * @param {string} [params.extractedText] Text extracted from the compiled PDF (optional)
 * @param {number|null} [params.pageCount] Physical page count (optional; defaults to 1)
 * @param {object|null} [params.geometry] { pageOccupancyRatio, bottomWhitespacePt } (optional)
 * @returns {{ score: number, version: string, dimensions: object, penalties: object, metrics: object }}
 */
export function computeResumeQualityScore({
  structuredResume,
  candidateProfile = null,
  jobPosting = null,
  extractedText = '',
  pageCount = null,
  geometry = null,
}) {
  const doc = structuredResume || {};
  const projects = asList(doc.projects);
  const experience = asList(doc.experience);
  const projectBullets = projects.flatMap((p) => asList(p.bullets).map(bulletText).filter(Boolean));
  const experienceBullets = experience.flatMap((e) => asList(e.bullets).map(bulletText).filter(Boolean));
  const summaryText = doc.summary?.text || '';
  const skills = asList(doc.skills?.categories).flatMap((c) => asList(c.skills).map((s) => s?.name || s));
  const allBullets = [...projectBullets, ...experienceBullets];
  const dsaRendered = Boolean(doc.dsa?.hasSection);

  // ── 1. Evidence coverage ────────────────────────────────────────────────
  const bulletsWithEvidence = projects.flatMap((p) =>
    asList(p.bullets).filter((b) => asList(typeof b === 'object' ? b?.evidenceRefs : null).length > 0)
  );
  const evidenceCoverage = projectBullets.length
    ? clamp01(bulletsWithEvidence.length / projectBullets.length)
    : 0;

  // ── 2. Job relevance: required-skill terms present in bullets/summary ───
  const jobTerms = collectJobTerms(doc, jobPosting);
  const proseLower = [...projectBullets, ...experienceBullets, summaryText].join(' ').toLowerCase();
  const relevanceHits = [...jobTerms].filter((t) => proseLower.includes(t)).length;
  const jobRelevance = jobTerms.size ? clamp01(relevanceHits / jobTerms.size) : 0.5;

  // ── 3. Technical specificity ────────────────────────────────────────────
  const specificityScores = allBullets.map((t) => {
    const lower = t.toLowerCase();
    let s = 0;
    for (const tok of TECH_SIGNAL_TOKENS) if (lower.includes(tok)) s += 1;
    const hasTech = asList(doc.projects.find((p) => asList(p.bullets).some((b) => bulletText(b) === t))?.technologies)
      .some((tech) => lower.includes(String(tech).toLowerCase()));
    if (hasTech) s += 1;
    return clamp01(s / 4);
  });
  const technicalSpecificity = allBullets.length ? mean(specificityScores) : 0;

  // ── 4. Accomplishment strength (action-led, outcome-shaped) ─────────────
  const strengthScores = allBullets.map((t) => {
    const lower = t.toLowerCase();
    const startsWithAction = ACTION_VERBS.some((v) => lower.startsWith(v + ' ') || lower.startsWith(v + 'a'));
    const hasObject = t.split(/\s+/).length >= 10;
    const hasClauses = /;|, (?:using|with|supporting|enabling|reducing|improving)|\bwhich\b/.test(lower);
    return clamp01((startsWithAction ? 0.5 : 0) + (hasObject ? 0.25 : 0) + (hasClauses ? 0.25 : 0));
  });
  const accomplishmentStrength = allBullets.length ? mean(strengthScores) : 0;

  // ── 5. Semantic diversity (mean pairwise distance between bullets) ──────
  let semanticDiversity = 1;
  if (allBullets.length > 1) {
    const pairs = [];
    for (let i = 0; i < allBullets.length; i++) {
      for (let j = i + 1; j < allBullets.length; j++) {
        pairs.push(1 - calculateTokenOverlap(allBullets[i], allBullets[j]));
      }
    }
    semanticDiversity = clamp01(mean(pairs));
  }

  // ── 6. Section completeness ─────────────────────────────────────────────
  const text = extractedText || synthesizeText(doc);
  const lowerText = text.toLowerCase();
  const sectionPresent = {};
  for (const [key, labels] of Object.entries(SECTION_LABELS)) {
    sectionPresent[key] = labels.some((l) => lowerText.includes(l));
  }
  const completenessChecks = [
    sectionPresent.SUMMARY && summaryText.length > 80,
    sectionPresent.SKILLS && skills.length > 0,
    sectionPresent.PROJECTS && projects.length > 0,
    sectionPresent.EXPERIENCE && experience.length > 0,
    sectionPresent.EDUCATION && asList(doc.education).length > 0,
    sectionPresent.DSA === dsaRendered, // rendered iff intended
    dsaRendered ? sectionPresent.DSA : true,
  ];
  const sectionCompleteness = clamp01(completenessChecks.filter(Boolean).length / completenessChecks.length);

  // ── 7. Information density (words per bullet & summary economy) ────────
  const wordsPerBullet = mean(allBullets.map((t) => t.split(/\s+/).length));
  const summaryWords = summaryText.split(/\s+/).filter(Boolean).length;
  const densityScore =
    allBullets.length === 0
      ? 0
      : clamp01(
          (wordsPerBullet >= 12 && wordsPerBullet <= 40 ? 0.7 : wordsPerBullet >= 8 ? 0.4 : 0) +
            (summaryWords >= 20 && summaryWords <= 80 ? 0.3 : summaryWords > 0 ? 0.15 : 0)
        );

  // ── 8. ATS structural correctness ───────────────────────────────────────
  const order = asList(doc.sectionOrder);
  const canonicalOrder = ['HEADER', 'SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECTS', 'DSA', 'EDUCATION', 'CERTIFICATIONS'];
  const orderIdx = order.map((s) => canonicalOrder.indexOf(s)).filter((i) => i >= 0);
  const orderValid = orderIdx.every((v, i) => i === 0 || v > orderIdx[i - 1]);
  const atsStructural = clamp01(
    (orderValid ? 0.4 : 0) +
      (sectionPresent.SUMMARY ? 0.15 : 0) +
      (sectionPresent.SKILLS ? 0.15 : 0) +
      (sectionPresent.PROJECTS || sectionPresent.EXPERIENCE ? 0.15 : 0) +
      (!/\uFFFD/.test(text) && !/[\uFB00-\uFB04\uFB06]/.test(text) ? 0.15 : 0)
  );

  // ── 9. Unsupported-claim penalty (numeric metrics without evidence refs) ─
  const metricPattern = /(?:\b\d+(?:\.\d+)?%|\b\d+\s*(?:million|billion)|\b\d{2,}\+?\s*(?:users|requests|rps|qps|customers)|\$\s?\d|\b\d+\s*(?:ms|s)\s+(?:latency|p\d))/i;
  const evidencedBulletTexts = new Set(
    projects.flatMap((p) =>
      asList(p.bullets)
        .filter((b) => asList(typeof b === 'object' ? b?.evidenceRefs : null).length > 0)
        .map(bulletText)
    )
  );
  let unsupportedClaims = 0;
  for (const t of [...projectBullets, summaryText]) {
    if (metricPattern.test(t)) {
      const isEvidenced = evidencedBulletTexts.has(t);
      const hasContext = /\b(?:across|within|in)\b.{0,60}(?:tests?|benchmarks?|profiling|load|local|sandbox|staging|dataset)\b/i.test(t);
      if (!isEvidenced && !hasContext) unsupportedClaims += 1;
    }
  }
  const unsupportedPenalty = Math.min(MAX_UNSUPPORTED_PENALTY, unsupportedClaims * 5);

  // ── 10. Redundancy penalty (pairwise bullet similarity) ────────────────
  let redundantPairs = 0;
  for (let i = 0; i < allBullets.length; i++) {
    for (let j = i + 1; j < allBullets.length; j++) {
      if (calculateTokenOverlap(allBullets[i], allBullets[j]) >= 0.55) redundantPairs += 1;
    }
  }
  const redundancyRate = allBullets.length > 1 ? redundantPairs / allBullets.length : 0;
  const redundancyPenalty = Math.min(MAX_REDUNDANCY_PENALTY, Math.round(redundancyRate * MAX_REDUNDANCY_PENALTY));

  // ── Page constraint penalty ─────────────────────────────────────────────
  const pages = Number.isFinite(pageCount) ? pageCount : 1;
  let pagePenalty = 0;
  if (pages > 1) pagePenalty = Math.min(MAX_PAGE_PENALTY, (pages - 1) * 10);
  const occupancy = Number(geometry?.pageOccupancyRatio);
  if (pages === 1 && Number.isFinite(occupancy) && occupancy < 0.5) {
    pagePenalty += Math.round((0.5 - occupancy) * 20); // excessive whitespace on one page
  }

  const dimensions = {
    evidenceCoverage: round2(evidenceCoverage * WEIGHTS.evidenceCoverage),
    jobRelevance: round2(jobRelevance * WEIGHTS.jobRelevance),
    technicalSpecificity: round2(technicalSpecificity * WEIGHTS.technicalSpecificity),
    accomplishmentStrength: round2(accomplishmentStrength * WEIGHTS.accomplishmentStrength),
    semanticDiversity: round2(semanticDiversity * WEIGHTS.semanticDiversity),
    sectionCompleteness: round2(sectionCompleteness * WEIGHTS.sectionCompleteness),
    informationDensity: round2(densityScore * WEIGHTS.informationDensity),
    atsStructuralCorrectness: round2(atsStructural * WEIGHTS.atsStructuralCorrectness),
  };
  const base = Object.values(dimensions).reduce((a, b) => a + b, 0);
  const penalties = {
    unsupportedClaims: { count: unsupportedClaims, applied: unsupportedPenalty },
    redundancy: { rate: round2(redundancyRate), redundantPairs, applied: redundancyPenalty },
    pageConstraint: { pageCount: pages, occupancy: Number.isFinite(occupancy) ? round2(occupancy) : null, applied: pagePenalty },
  };

  const score = Math.max(0, Math.min(100, Math.round(base - unsupportedPenalty - redundancyPenalty - pagePenalty)));

  return {
    score,
    version: QUALITY_SCORE_VERSION,
    dimensions,
    penalties,
    metrics: {
      projectBulletCount: projectBullets.length,
      experienceBulletCount: experienceBullets.length,
      skillCount: skills.length,
      dsaRendered,
      wordsPerBullet: round2(wordsPerBullet),
      summaryWords,
      sectionPresence: sectionPresent,
    },
  };
}

/**
 * Collects generic job-requirement terms from the job posting's structured
 * requirements/skills/title. Falls back to the document's target role text.
 * Terms are normalized lowercase tokens ≥3 chars (generic normalization only).
 */
function collectJobTerms(doc, jobPosting) {
  const terms = new Set();
  const pushTerm = (raw) => {
    const t = String(raw || '').trim().toLowerCase();
    if (t.length >= 3 && t.length <= 40) terms.add(t);
  };
  const jp = jobPosting || {};
  asList(jp.requirements).forEach(pushTerm);
  asList(jp.skills).forEach((s) => pushTerm(typeof s === 'string' ? s : s?.name));
  if (!terms.size) {
    // Fallback: derive terms from the target role text itself
    String(doc.targetRole || jp.title || '')
      .split(/[^a-zA-Z0-9+#.]+/)
      .forEach((w) => {
        if (w.length >= 3) pushTerm(w);
      });
  }
  return terms;
}

/** Deterministic text synthesis from the structured document (no PDF needed). */
function synthesizeText(doc) {
  const parts = [
    (doc.summary?.text || ''),
    asList(doc.skills?.categories)
      .map((c) => `${c.categoryName}: ${asList(c.skills).map((s) => s?.name || s).join(', ')}`)
      .join('\n'),
    asList(doc.projects)
      .map((p) => `${p.name}\n${asList(p.bullets).map(bulletText).join('\n')}`)
      .join('\n'),
    asList(doc.experience)
      .map((e) => `${e.title || ''} ${e.company || ''}\n${asList(e.bullets).map(bulletText).join('\n')}`)
      .join('\n'),
  ];
  return parts.filter(Boolean).join('\n');
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

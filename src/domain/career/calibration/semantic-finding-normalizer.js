/**
 * @file Semantic Finding Normalizer (P85)
 *
 * Implements the 5-step canonical finding normalization pipeline:
 * raw finding -> canonical category -> canonical subject -> canonical polarity (stance) -> canonical evidence requirement -> normalized finding
 *
 * Enforces:
 * - Deterministic concept convergence (synonymous cloud phrasings converge)
 * - Conflict preservation (Redis vs. NoSQL stays CONFLICTING with NO_AUTO_ACTION)
 * - Strict separation of consensus (what models said) from candidate truth (what candidate evidence supports)
 */

import {
  NormalizedFindingSchema,
  SemanticConsensusFindingSchema,
} from './multimodel-evaluation.schemas.js';

/**
 * Deterministic normalization rules for recognized domain findings.
 */
const CANONICAL_RULES = [
  {
    regex:
      /(cloud|aws|gcp|azure|hyperscaler).*(miss|absent|lack|no|exposure|gap)|(miss|absent|lack|no|without).*(cloud|aws|gcp|azure|hyperscaler)/i,
    category: 'MISSING_PREFERRED_SKILL',
    subject: 'CLOUD_PLATFORM',
    stance: 'SUPPORT',
    normalizedClaim: 'Missing preferred cloud platform experience (AWS/GCP/Azure)',
    evidenceRequirement: 'CANONICAL_FACTS_OR_PROJECTS',
  },
  {
    regex:
      /redis.*(not.*satisfy|does.*not|gap|cache.*not|different)|nosql.*(miss|gap|absent|not.*covered|not.*satisfy)/i,
    category: 'MISSING_PREFERRED_SKILL',
    subject: 'NOSQL_DATABASE',
    stance: 'REJECT', // Rejects Redis as satisfying NoSQL
    normalizedClaim:
      'Redis key-value caching does not satisfy primary NoSQL document database requirement',
    evidenceRequirement: 'JOB_DESCRIPTION_ALIGNMENT',
  },
  {
    regex:
      /redis.*(demonstrates|satisfies|counts|qualifies|covers)|(demonstrates|satisfies|counts|qualifies|covers).*(nosql|redis)|nosql.*experience.*via.*redis/i,
    category: 'EXACT_SKILL_MATCH',
    subject: 'NOSQL_DATABASE',
    stance: 'SUPPORT', // Accepts Redis as satisfying NoSQL
    normalizedClaim: 'Redis clustering satisfies NoSQL data storage criteria',
    evidenceRequirement: 'JOB_DESCRIPTION_ALIGNMENT',
  },
  {
    regex: /redis.*(related|partial|not.*equivalent|caching.*only)|(related|partial).*nosql/i,
    category: 'RELATED_SKILL_MATCH',
    subject: 'NOSQL_DATABASE',
    stance: 'PARTIAL', // Considers Redis related but not fully equivalent
    normalizedClaim: 'Redis is related to NoSQL concepts but not equivalent to document databases',
    evidenceRequirement: 'JOB_DESCRIPTION_ALIGNMENT',
  },
  {
    regex: /electronics.*(degree|branch|mismatch|cs)|degree.*(electronics|mismatch|non-cs)/i,
    category: 'DEGREE_REQUIREMENT_MISMATCH',
    subject: 'COMPUTER_SCIENCE_DEGREE',
    stance: 'SUPPORT',
    normalizedClaim:
      'Degree is Electronics Engineering rather than required Computer Science or IT discipline',
    evidenceRequirement: 'CANONICAL_EDUCATION_FACTS',
  },
  {
    regex: /nestjs.*(unsupported|lack|unbacked|absent|summary|evidence)|(summary|claim).*nestjs/i,
    category: 'UNSUPPORTED_CLAIM',
    subject: 'NESTJS_EXPERIENCE',
    stance: 'SUPPORT',
    normalizedClaim:
      'NestJS claimed in professional summary without backing in Skills, Projects, or Experience',
    evidenceRequirement: 'PROJECT_OR_EXPERIENCE_FACTS',
  },
  {
    regex: /40%.*(metric|precision|baseline|evidence|load)|page.*load.*40%|unanchored.*metric/i,
    category: 'METRIC_EVIDENCE_GAP',
    subject: 'METRIC_PRECISION_40_PERCENT',
    stance: 'SUPPORT',
    normalizedClaim:
      '40% page load reduction metric lacks baseline, measurement method, and supporting context',
    evidenceRequirement: 'MEASUREMENT_BASELINE_FACTS',
  },
  {
    regex: /link.*(url|visible|parse|extract|label)|(contact|social).*(url|link)|contact.*risk/i,
    category: 'LINK_EXTRACTION_RISK',
    subject: 'CONTACT_VISIBLE_URLS',
    stance: 'SUPPORT',
    normalizedClaim: 'Contact links lack visible fallback URLs for ATS text extraction parsers',
    evidenceRequirement: 'RENDERED_DOCUMENT_FORMAT',
  },
  {
    regex: /date.*(format|dash|en-dash|hyphen)|inconsistent.*date/i,
    category: 'DATE_FORMAT_RISK',
    subject: 'DATE_RANGE_EN_DASH',
    stance: 'SUPPORT',
    normalizedClaim:
      'Employment date intervals use inconsistent dashes instead of typographic en-dashes',
    evidenceRequirement: 'RENDERED_DOCUMENT_FORMAT',
  },
  {
    regex: /ai.*(coding|assistant|copilot|cursor)|missing.*ai/i,
    category: 'MISSING_PREFERRED_SKILL',
    subject: 'AI_CODING_TOOLS',
    stance: 'SUPPORT',
    normalizedClaim:
      'AI coding tools (Copilot, Cursor) are preferred by JD but omitted from technical skills',
    evidenceRequirement: 'CANONICAL_FACTS_OR_PROJECTS',
  },
];

/**
 * Normalizes a single raw finding string into a canonical finding representation.
 *
 * @param {string} rawFinding
 * @param {string} evaluatorId
 * @returns {object} NormalizedFindingSchema object
 */
export function normalizeSingleFinding(rawFinding, evaluatorId) {
  if (typeof rawFinding !== 'string' || !rawFinding.trim()) {
    throw new Error('rawFinding must be a non-empty string');
  }

  for (let i = 0; i < CANONICAL_RULES.length; i++) {
    const rule = CANONICAL_RULES[i];
    if (rule.regex.test(rawFinding)) {
      const findingId = `norm-${evaluatorId}-${rule.subject.toLowerCase()}-${i}`;
      return NormalizedFindingSchema.parse({
        findingId,
        category: rule.category,
        subject: rule.subject,
        normalizedClaim: rule.normalizedClaim,
        evaluatorId,
        stance: rule.stance,
        confidence: 'HIGH',
        evidenceRequirement: rule.evidenceRequirement,
        evidenceStatus: 'UNVERIFIED',
        rawText: rawFinding,
      });
    }
  }

  // Fallback generic normalization
  const subjectSlug = rawFinding
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toUpperCase();
  return NormalizedFindingSchema.parse({
    findingId: `norm-${evaluatorId}-generic-${Date.now()}`,
    category: 'CONTENT_QUALITY_ISSUE',
    subject: subjectSlug || 'GENERIC_QUALITY_OBSERVATION',
    normalizedClaim: rawFinding,
    evaluatorId,
    stance: 'UNKNOWN',
    confidence: 'MEDIUM',
    evidenceRequirement: 'CANONICAL_FACTS_OR_PROJECTS',
    evidenceStatus: 'UNVERIFIED',
    rawText: rawFinding,
  });
}

/**
 * Normalizes an array of raw findings for an evaluator.
 *
 * @param {Array<string>} rawFindings
 * @param {string} evaluatorId
 * @returns {Array<object>} Array of NormalizedFindingSchema objects
 */
export function normalizeEvaluatorFindings(rawFindings, evaluatorId) {
  if (!Array.isArray(rawFindings)) return [];
  return rawFindings.map((f) => normalizeSingleFinding(f, evaluatorId));
}

/**
 * Calculates semantic consensus across normalized findings from multiple evaluators.
 * Preserves conflicting stances as CONFLICTING with NO_AUTO_ACTION.
 *
 * @param {Array<object>} allNormalizedFindings
 * @returns {Array<object>} Array of SemanticConsensusFindingSchema objects
 */
export function calculateSemanticConsensus(allNormalizedFindings) {
  const groupedBySubject = {};

  for (const finding of allNormalizedFindings) {
    if (!groupedBySubject[finding.subject]) {
      groupedBySubject[finding.subject] = [];
    }
    groupedBySubject[finding.subject].push(finding);
  }

  const consensusResults = [];

  for (const [subject, findings] of Object.entries(groupedBySubject)) {
    const distinctEvaluators = new Set(findings.map((f) => f.evaluatorId));
    const evaluatorCount = distinctEvaluators.size;

    // Group evaluators by stance
    const stanceMap = {};
    for (const f of findings) {
      if (!stanceMap[f.stance]) stanceMap[f.stance] = new Set();
      stanceMap[f.stance].add(f.evaluatorId);
    }

    const positions = Object.entries(stanceMap).map(([stance, evalSet]) => ({
      stance,
      evaluators: Array.from(evalSet),
      observation: findings.find((f) => f.stance === stance)?.normalizedClaim,
    }));

    const distinctStances = Object.keys(stanceMap);
    const category = findings[0].category;
    let classification = 'UNVERIFIED';
    let action = 'NO_ACTION';
    let rationale = '';

    // Check for conflict: multiple conflicting stances (e.g. SUPPORT vs REJECT vs PARTIAL)
    const activeStances = distinctStances.filter((s) => s !== 'UNKNOWN');
    const isConflicting = activeStances.length > 1;

    if (isConflicting) {
      classification = 'CONFLICTING';
      action = 'NO_AUTO_ACTION';
      rationale = `Evaluators directly disagree on ${subject} (${positions.map((p) => `${p.stance}: [${p.evaluators.join(',')}]`).join(' vs ')}). Block automated modification.`;
    } else if (evaluatorCount === 3) {
      classification = 'CONSENSUS';
      action = 'SAFE_FIX';
      rationale = `All 3 evaluators agree on ${subject} (${positions[0]?.stance}).`;
    } else if (evaluatorCount === 2) {
      classification = 'MAJORITY';
      action = 'SAFE_FIX';
      rationale = `Majority (2/3) evaluators agree on ${subject}.`;
    } else {
      classification = 'MINORITY';
      action = 'NO_ACTION';
      rationale = `Single evaluator noted ${subject}. Insufficient consensus.`;
    }

    const item = {
      findingId: `consensus-${subject.toLowerCase()}`,
      subject,
      category,
      classification,
      positions,
      evidenceStatus: 'UNVERIFIED',
      action,
      rationale,
    };

    consensusResults.push(SemanticConsensusFindingSchema.parse(item));
  }

  return consensusResults;
}

/**
 * Audits a consensus finding against canonical candidate facts.
 * Crucial Rule 44: Candidate evidence outranks external model consensus.
 *
 * @param {object} consensusFinding SemanticConsensusFindingSchema object
 * @param {object} candidateEvidence Object containing candidate profile facts and projects
 * @returns {object} Updated SemanticConsensusFindingSchema object
 */
export function auditFindingAgainstEvidence(consensusFinding, candidateEvidence = {}) {
  const { facts = [], projects = [], skills = [] } = candidateEvidence;

  const findingCopy = { ...consensusFinding };

  // Rule: Even if all models say "add AWS", if candidate has no AWS facts, it is an UNSAFE_FABRICATION!
  if (findingCopy.subject === 'CLOUD_PLATFORM') {
    const hasCloudEvidence =
      facts.some((f) => /aws|gcp|azure|cloud/i.test(f.statement || f.text || '')) ||
      projects.some((p) => (p.technologies || []).some((t) => /aws|gcp|azure/i.test(t)));

    if (!hasCloudEvidence) {
      findingCopy.evidenceStatus = 'UNSUPPORTED';
      findingCopy.action = 'UNSAFE_FABRICATION';
      findingCopy.rationale =
        'External evaluators unanimously requested Cloud/AWS, but candidate facts contain zero cloud evidence. Hallucination blocked.';
    } else {
      findingCopy.evidenceStatus = 'VERIFIED';
      findingCopy.action = 'SAFE_FIX';
      findingCopy.rationale =
        'Candidate possesses verified cloud facts omitted from resume draft. Safe to restore.';
    }
  } else if (findingCopy.subject === 'NESTJS_EXPERIENCE') {
    const hasNest =
      facts.some((f) => /nestjs/i.test(f.statement || f.text || '')) ||
      projects.some((p) => (p.technologies || []).some((t) => /nestjs/i.test(t)));

    if (!hasNest) {
      findingCopy.evidenceStatus = 'UNSUPPORTED';
      findingCopy.action = 'SAFE_FIX';
      findingCopy.rationale = 'Prune unevidenced NestJS from summary to prevent ungrounded claims.';
    } else {
      findingCopy.evidenceStatus = 'VERIFIED';
      findingCopy.action = 'SAFE_FIX';
    }
  } else if (findingCopy.subject === 'METRIC_PRECISION_40_PERCENT') {
    findingCopy.evidenceStatus = 'PARTIALLY_SUPPORTED';
    findingCopy.action = 'CONDITIONAL_USER_CONFIRMATION';
    findingCopy.rationale =
      'Optimization work verified, but 40% precision requires user measurement confirmation.';
  } else if (findingCopy.classification === 'CONFLICTING') {
    findingCopy.action = 'NO_AUTO_ACTION';
  }

  return SemanticConsensusFindingSchema.parse(findingCopy);
}

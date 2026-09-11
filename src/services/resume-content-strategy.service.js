/**
 * @file Resume Content Strategy Service (P16-001D / Phase 16 Resume Architecture).
 *
 * Implements job-tailored professional summary generation and evidence-grounded
 * project bullet selection and rephrasing with strict provenance attachment,
 * metric safety guards, and zero-fabrication enforcement.
 *
 * Radical Truth Invariants:
 * 1. Professional summary is grounded strictly in candidate-owned evidence and target job requirements.
 * 2. Summary never invents years of experience, team size, employers, production scale, or unbacked technologies.
 * 3. Project bullets are prioritized based on relevance to matched job requirements.
 * 4. Rephrased bullets preserve factual meaning and never introduce ungrounded metrics or technologies.
 * 5. Quantitative claims require explicit corroborating evidence; ungrounded metrics fail closed.
 * 6. Deterministic execution: identical inputs produce bit-for-bit identical outputs.
 */

import { ValidationError } from '../errors/index.js';
import { CareerStatusDerivation } from '../utils/career-status-derivation.js';
import { TenureCalculator } from '../utils/tenure-calculator.js';
import {
  normalizeTechnologyName,
  normalizeTechnologySlug,
  isNoisyTechnology,
  formatTechnologyStack,
} from '../utils/technology-normalizer.js';

/**
 * Explicit semantic classification for evidence records (Req B).
 * Distinguishes presence evidence from authentic candidate claims.
 */
export const EVIDENCE_SEMANTIC_CLASS = {
  PRESENCE_EVIDENCE: 'PRESENCE_EVIDENCE',
  IMPLEMENTATION_EVIDENCE: 'IMPLEMENTATION_EVIDENCE',
  FEATURE_EVIDENCE: 'FEATURE_EVIDENCE',
  OUTCOME_EVIDENCE: 'OUTCOME_EVIDENCE',
  CANDIDATE_AUTHORED_CLAIM: 'CANDIDATE_AUTHORED_CLAIM',
};

/**
 * Classifies an evidence record into its semantic category.
 *
 * Hard Rule: PRESENCE_EVIDENCE alone can NEVER generate accomplishment prose.
 *
 * @param {object} ev Evidence record
 * @returns {string} One of EVIDENCE_SEMANTIC_CLASS values
 */
export function classifyEvidenceSemanticType(ev) {
  if (!ev || typeof ev !== 'object') return EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE;

  const type = String(ev.evidenceType || ev.type || '').toUpperCase();
  const hasAuthoredText = Boolean(ev.candidateAuthored || ev.claimText || ev.sourceType === 'CANDIDATE_PROFILE');

  if (hasAuthoredText) {
    return EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM;
  }

  if (['OUTCOME', 'BENCHMARK', 'METRIC'].includes(type)) {
    return EVIDENCE_SEMANTIC_CLASS.OUTCOME_EVIDENCE;
  }

  if (['FEATURE_SPEC', 'FEATURE_IMPLEMENTATION', 'FEATURE'].includes(type) && (ev.description || ev.featureSummary)) {
    return EVIDENCE_SEMANTIC_CLASS.FEATURE_EVIDENCE;
  }

  if (['COMMIT_MESSAGE', 'PULL_REQUEST_BODY'].includes(type) && (ev.message || ev.body)) {
    return EVIDENCE_SEMANTIC_CLASS.IMPLEMENTATION_EVIDENCE;
  }

  // All dependencies, packages, imports, file paths, and syntax usages are PRESENCE_EVIDENCE
  return EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE;
}

/**
 * Reusable helper determining whether a claim is safe to render as resume prose (Req C).
 *
 * Rejects:
 * - Presence evidence alone
 * - File-path leakage into user-facing text
 * - Generic template prose ("Developed X functionality", "verified by repository evidence")
 * - Unsubstantiated claims
 *
 * @param {string} claimText
 * @param {string} [semanticClass=EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM]
 * @returns {boolean}
 */
export function isClaimSafeToRender(claimText, semanticClass = EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM) {
  if (!claimText || typeof claimText !== 'string') return false;
  const trimmed = claimText.trim();
  if (trimmed.length < 15) return false;

  // PRESENCE_EVIDENCE alone can NEVER generate accomplishment prose
  if (semanticClass === EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE) return false;

  // File path leakage detection:
  if (
    /(?:^|\s)(?:src\/|lib\/|app\/|components\/|controllers\/|routes\/|services\/|utils\/|models\/|dockerfile|\S+\.(?:js|ts|jsx|tsx|py|go|rs|json|yaml|yml|sql|html|css|dockerfile))\b/i.test(
      trimmed
    )
  ) {
    return false;
  }

  // Generic template prose detection:
  if (
    /\b(?:verified by repository evidence|applied .* in verified project implementation|developed .* functionality)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Canonical helper for determining whether DSA content is meaningful and authentic (Req G).
 *
 * @param {object} dsa
 * @returns {boolean}
 */
export function isMeaningfulDsa(dsa) {
  if (!dsa || typeof dsa !== 'object') return false;
  if (dsa.hasSection === false) return false;

  const validUrl = typeof dsa.profileUrl === 'string' && /^https?:\/\//i.test(dsa.profileUrl.trim());
  const rawBullets = Array.isArray(dsa.bullets) ? dsa.bullets : [];
  const cleanBullets = rawBullets
    .map((b) => (typeof b === 'string' ? b.trim() : String(b?.text || '').trim()))
    .filter(Boolean);

  const nonFillerBullets = cleanBullets.filter((b) => {
    if (b.length < 25) return false;
    if (
      /^(?:engaged in problem solving|built foundational analytical complexity|practiced coding problems|solved questions online)\b/i.test(
        b
      )
    ) {
      return false;
    }
    return true;
  });

  const hasStats = Boolean(
    (typeof dsa.problemsSolved === 'number' && dsa.problemsSolved > 0) ||
      (Array.isArray(dsa.topics) && dsa.topics.length > 0) ||
      (Array.isArray(dsa.topicCoverage) && dsa.topicCoverage.length > 0) ||
      (typeof dsa.score === 'number' && dsa.score > 0)
  );

  return validUrl || nonFillerBullets.length > 0 || hasStats;
}

/**
 * Metric detection regex to enforce quantitative claim safety.
 * Matches percentages, high-count units, user scale, team size, financial values, and throughput claims.
 */
export const QUANTITATIVE_METRIC_REGEX =
  /(?:\b\d+(?:\.\d+)?%\s*(?:reduction|increase|improvement|availability|uptime|latency|cost|performance|throughput|load|memory|time)?|\b\d+\s*(?:million|m|k|billion)\s+(?:users|requests|events|queries|rps|calls)|\b\d+\+?\s*(?:users|requests|events|queries|clients|customers)|\b\d+-person\s+team|\bteam\s+of\s+\d+|\$\d+[\d,.]*(?:k|m|b|kilo|million)?)/i;

/**
 * Regex patterns for detecting unsupported employment tenure assertions.
 */
export const TENURE_CLAIM_PATTERN =
  /\b(\d+|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b)\+?\s*years?\s+(?:of\s+)?(?:experience|working|tenure|employment|professional|industry)\b/i;

/**
 * Builds a generic project highlight clause for the professional summary from
 * candidate-owned project facts only (summary text or evidenced technologies).
 * Never invents metrics, scale, or technologies.
 *
 * @param {object} project Candidate-owned project record
 * @returns {string|null} Clause fragment (always starts with ', ') or null
 */
function buildProjectHighlightClause(project, roleFocus = { isBackendFocus: false, isFrontendFocus: false }) {
  if (!project || typeof project !== 'object') return null;
  const summary = typeof project.summary === 'string' ? project.summary.trim() : '';
  if (summary.length > 0 && summary.length <= 120) {
    const clause = summary.replace(/[.\s]+$/, '');
    if (clause) {
      return `, ${clause.charAt(0).toLowerCase()}${clause.slice(1)}`;
    }
  }
  const techs = roleAlignTechnologies(
    Array.isArray(project.technologies)
      ? project.technologies.filter((t) => typeof t === 'string' && t.trim())
      : [],
    roleFocus
  ).slice(0, 3);
  if (techs.length >= 2) {
    return `, built with ${techs.join(', ')}`;
  }
  return null;
}

/**
 * Role focus taxonomy derived generically from the target job text.
 * Used only to keep summary/project highlights role-aligned — never to force
 * a specific archetype label onto the candidate identity.
 */
function deriveRoleFocus(targetRoleTitle, jobDescText) {
  const titleLower = String(targetRoleTitle || '').toLowerCase();
  const descLower = String(jobDescText || '').toLowerCase();
  const isBackendFocus =
    /\b(backend|server|api|distributed|microservice|python|fastapi|django|node|database|sql|postgres)\b/i.test(titleLower) ||
    (/\b(backend|server|api|database)\b/i.test(descLower) &&
      !/\b(frontend|ui|react|vue|angular)\b/i.test(titleLower));
  const isFrontendFocus =
    /\b(frontend|ui|ux|web|client|react|typescript|javascript|next\.js|angular|vue)\b/i.test(titleLower) ||
    (/\b(frontend|react|ui)\b/i.test(descLower) &&
      !/\b(backend|database|infra)\b/i.test(titleLower));
  return { isBackendFocus, isFrontendFocus };
}

/**
 * Role-aligned technology filter for summary clauses: keeps only technologies
 * consistent with the detected role focus (or all when focus is mixed/unclear).
 *
 * @param {Array<string>} techs
 * @param {{isBackendFocus: boolean, isFrontendFocus: boolean}} roleFocus
 * @returns {Array<string>}
 */
function roleAlignTechnologies(techs, roleFocus) {
  const BACKEND_MARKERS = ['python', 'fastapi', 'django', 'flask', 'postgres', 'postgresql', 'mysql', 'node', 'nodejs', 'express', 'sql', 'redis', 'mongodb', 'graphql', 'api', 'rest', 'kafka', 'docker', 'kubernetes'];
  const FRONTEND_MARKERS = ['react', 'typescript', 'javascript', 'nextjs', 'next-js', 'vue', 'angular', 'html', 'css', 'tailwind', 'tailwindcss', 'ui', 'frontend'];
  if (!roleFocus.isBackendFocus && !roleFocus.isFrontendFocus) return techs;
  const markers = roleFocus.isBackendFocus && !roleFocus.isFrontendFocus ? BACKEND_MARKERS : FRONTEND_MARKERS;
  const aligned = techs.filter((t) => markers.includes(slugifyTerm(t)));
  return aligned.length >= 2 ? aligned : techs;
}

/**
 * Normalizes a text slug for comparison.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugifyTerm(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
}

/**
 * Normalizes any raw evidence record into strict EvidenceReferenceSchema shape.
 *
 * @param {object} rawRef
 * @param {string} [defaultSourceType='VERIFIED']
 * @returns {object|null}
 */
export function toEvidenceReference(rawRef, defaultSourceType = 'VERIFIED') {
  if (!rawRef || typeof rawRef !== 'object') return null;
  const isUuid = (str) =>
    typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const evidenceId = isUuid(rawRef.evidenceId)
    ? rawRef.evidenceId
    : isUuid(rawRef.id)
      ? rawRef.id
      : null;

  const filePath =
    rawRef.filePath ||
    rawRef.sourceLocation?.filePath ||
    null;

  return {
    sourceType: rawRef.sourceType || defaultSourceType,
    evidenceId,
    resourceId: rawRef.resourceId || null,
    resourceName: rawRef.resourceName || null,
    filePath,
    commitSha: rawRef.commitSha || null,
    evidenceType: rawRef.evidenceType || null,
    matchedRequirementId: rawRef.matchedRequirementId || null,
    confidenceScore: typeof rawRef.confidenceScore === 'number' ? rawRef.confidenceScore : 1.0,
    provenanceTrustClass: rawRef.provenanceTrustClass || null,
    notes: rawRef.notes || null,
  };
}

/**
 * Asserts metric safety on any generated or candidate text.
 * Throws ValidationError if a quantitative metric or tenure claim is present without explicit evidence.
 *
 * @param {string} text The claim text to inspect
 * @param {Array<object>} [evidenceRefs=[]] Supporting evidence reference objects
 * @param {object} [options={}] Optional flags (e.g. sourceText to permit pre-existing metrics)
 * @throws {ValidationError} When an ungrounded metric or tenure claim is found
 */
export function assertMetricSafety(text, evidenceRefs = [], options = {}) {
  if (!text || typeof text !== 'string') return;

  const hasQuantitative = QUANTITATIVE_METRIC_REGEX.test(text);
  if (hasQuantitative) {
    // If the exact metric is present in the authentic source text or evidence, it is permitted
    const sourceHasMetric = options.sourceText && QUANTITATIVE_METRIC_REGEX.test(options.sourceText);
    const evidenceHasMetric = Array.isArray(evidenceRefs) && evidenceRefs.some((ref) => {
      const snippet = ref.contextSnippet || ref.snippet || ref.sourceLocation?.snippet || '';
      return QUANTITATIVE_METRIC_REGEX.test(snippet);
    });

    if (!sourceHasMetric && !evidenceHasMetric && (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0)) {
      throw new ValidationError(
        `Ungrounded quantitative claim detected in tailored resume text without corroborating evidence: "${text}". Claims containing metrics, performance gains, team sizes, or scale require explicit source evidence.`
      );
    }
  }

  // Check for tenure claims (e.g. "5+ years of experience")
  if (TENURE_CLAIM_PATTERN.test(text)) {
    const sourceHasTenure = options.sourceText && TENURE_CLAIM_PATTERN.test(options.sourceText);
    const hasWorkHistoryTenure = Boolean(options.hasWorkHistoryTenure);
    if (!sourceHasTenure && !hasWorkHistoryTenure) {
      throw new ValidationError(
        `Unsupported employment tenure claim detected in tailored resume text: "${text}". Tenure claims must be derived strictly from verified work history.`
      );
    }
  }
}

/**
 * Validates that bullet rephrasing preserved factual truth and did not inject unbacked claims.
 *
 * @param {string} sourceText Original authentic candidate bullet
 * @param {string} rephrasedText Rephrased candidate bullet
 * @param {object} [candidateContext={}] Candidate context with known skills and evidence
 * @throws {ValidationError} When rephrasing violates factual truth
 */
export function validateRephrasingSafety(sourceText, rephrasedText, candidateContext = {}) {
  if (!sourceText || !rephrasedText) return;

  // 1. Metric safety: Rephrased text must not introduce new quantitative metrics
  if (QUANTITATIVE_METRIC_REGEX.test(rephrasedText) && !QUANTITATIVE_METRIC_REGEX.test(sourceText)) {
    throw new ValidationError(
      `Rephrased bullet injected ungrounded quantitative metric not present in source bullet: "${rephrasedText}". Source: "${sourceText}".`
    );
  }

  // 2. Tenure safety: Rephrased text must not introduce new tenure claims
  if (TENURE_CLAIM_PATTERN.test(rephrasedText) && !TENURE_CLAIM_PATTERN.test(sourceText)) {
    throw new ValidationError(
      `Rephrased bullet injected unbacked employment tenure claim: "${rephrasedText}".`
    );
  }

  // 3. Seniority/Scale inflation guard: Must not introduce ungrounded scale or executive titles
  const scalePatterns = [
    /\bmillions of users\b/i,
    /\bscale to millions\b/i,
    /\bhigh-scale production cluster\b/i,
    /\benterprise-wide governance\b/i,
  ];
  for (const pattern of scalePatterns) {
    if (pattern.test(rephrasedText) && !pattern.test(sourceText)) {
      throw new ValidationError(
        `Rephrased bullet injected unbacked production scale claim: "${rephrasedText}".`
      );
    }
  }

  // 4. Technology injection guard: Rephrased text must not introduce technologies absent from candidate context
  const knownTechSlugs = new Set();
  const rawCandidateSkills = candidateContext.skills || candidateContext.technologies || [];
  for (const s of rawCandidateSkills) {
    const slug = typeof s === 'string' ? slugifyTerm(s) : s.slug || slugifyTerm(s.name || s.skillName);
    if (slug) knownTechSlugs.add(slug);
  }
  if (Array.isArray(candidateContext.projects)) {
    for (const p of candidateContext.projects) {
      for (const t of p.technologies || []) {
        knownTechSlugs.add(slugifyTerm(t));
      }
    }
  }

  const KNOWN_TECHNOLOGY_TERMS = [
    'kubernetes', 'docker', 'aws', 'gcp', 'azure', 'rust', 'golang', 'go',
    'kafka', 'graphql', 'redis', 'spark', 'hadoop', 'terraform', 'elasticsearch',
    'solr', 'rabbitmq', 'microservices', 'serverless', 'lambda',
  ];

  const sourceLower = sourceText.toLowerCase();
  const rephrasedLower = rephrasedText.toLowerCase();

  for (const term of KNOWN_TECHNOLOGY_TERMS) {
    const termRegex = new RegExp(`\\b${term}\\b`, 'i');
    if (termRegex.test(rephrasedLower) && !termRegex.test(sourceLower)) {
      const slug = slugifyTerm(term);
      if (!knownTechSlugs.has(slug)) {
        throw new ValidationError(
          `Rephrased bullet injected unbacked technology '${term}' not present in candidate records or source bullet.`
        );
      }
    }
  }
}

/**
 * Minimum evidence confidence for an evidence record to back a synthesized
 * evidence-derived project bullet. Generic domain constant, not fixture-tuned.
 */
const EVIDENCE_DERIVED_BULLET_MIN_CONFIDENCE = 0.6;

/**
 * Builds an evidence-backed candidate-owned bullet pool for a project.
 *
 * Core Architectural Rules (P16-003):
 * 1. Candidate-authored bullets are always the primary pool entries.
 * 2. PRESENCE_EVIDENCE (dependencies, imports, file paths, syntax usage) alone
 *    must NEVER generate accomplishment prose.
 * 3. Never manufacture template prose ("Developed X functionality in file Y...").
 * 4. Bullets can only be derived if candidate-authored claims or verified
 *    FEATURE_EVIDENCE with authentic descriptive prose exists.
 * 5. If no truthful candidate-authored accomplishment can be constructed from
 *    supported evidence, OMIT THE CLAIM rather than inventing prose.
 *
 * @param {object} project Candidate project record with evidence
 * @param {Array<object>} authoredBullets Scored authored bullets
 * @param {Set<string>} jobTerms Lowercased job keyword terms
 * @param {number} targetTotal Desired total bullet count for this project
 * @returns {Array<object>} Additional bullet objects (same shape as scored authored bullets)
 */
function deriveEvidenceBackedBullets(project, authoredBullets, jobTerms, targetTotal) {
  const derived = [];
  const deficit = targetTotal - authoredBullets.length;
  if (deficit <= 0) return derived;

  // HARD ARCHITECTURAL INVARIANT (Req B & C):
  // Candidate-authored accomplishment content is the primary resume prose.
  // PRESENCE_EVIDENCE (packages, imports, file paths, framework presence) alone
  // can NEVER manufacture accomplishment bullets or "Developed X functionality" prose.
  for (const ev of Array.isArray(project.evidence) ? project.evidence : []) {
    if (derived.length >= deficit) break;
    const semClass = classifyEvidenceSemanticType(ev);
    if (semClass === EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE) {
      continue; // Strictly omit: presence evidence cannot become prose
    }

    const claimText = ev.description || ev.featureSummary || ev.claimText || ev.message || null;
    if (claimText && isClaimSafeToRender(claimText, semClass)) {
      derived.push({
        text: claimText.trim(),
        origText: claimText.trim(),
        evidenceRefs: [toEvidenceReference(ev, 'VERIFIED')].filter(Boolean),
        matchedRequirementIds: ev.matchedRequirementId ? [ev.matchedRequirementId] : [],
        provenanceStatus: 'VERIFIED',
        relevanceScore: 25,
        origIndex: Number.MAX_SAFE_INTEGER - derived.length,
        isEvidenceDerived: true,
      });
    }
  }

  return derived;
}

/**
 * Extracts and classifies candidate skills by job relevance.
 *
 * @param {object} candidateProfile
 * @param {object} jobPosting
 * @param {object} [matchAnalysis]
 * @returns {Array<object>} Candidate skills ranked by relevance to job
 */
function extractRankedCandidateSkills(candidateProfile, jobPosting, matchAnalysis) {
  const meta = candidateProfile?.profileMetadata || {};
  const rawSkills = meta.skills || candidateProfile?.skills || [];
  const candidateSkills = [];

  const jobDescText = String(
    (jobPosting?.title || '') +
      ' ' +
      (jobPosting?.description || '') +
      ' ' +
      (jobPosting?.requirements || []).join(' ') +
      ' ' +
      (jobPosting?.skills || []).join(' ')
  ).toLowerCase();

  const matchedReqMap = new Map();
  if (matchAnalysis?.skillMatches && Array.isArray(matchAnalysis.skillMatches)) {
    for (const m of matchAnalysis.skillMatches) {
      const slug = slugifyTerm(m.skillName || m.skillSlug || m.extractedValue);
      if (slug) matchedReqMap.set(slug, m);
    }
  }

  for (const s of rawSkills) {
    const name = typeof s === 'string' ? s : s.name || s.skillName;
    if (!name) continue;
    const slug = slugifyTerm(typeof s === 'string' ? s : s.slug || name);
    const provenanceStatus = typeof s === 'object' && s.provenanceStatus
      ? s.provenanceStatus
      : (s.verified ? 'VERIFIED' : 'CLAIMED');
    const evidenceCount = s.evidenceCount || (Array.isArray(s.evidence) ? s.evidence.length : 0);
    const evidenceId = s.evidenceId || (Array.isArray(s.evidence) && s.evidence[0]?.id) || null;

    let relevanceScore = 0;
    const matchedReq = matchedReqMap.get(slug);

    if (matchedReq) {
      relevanceScore += 50;
      if (matchedReq.importance === 'REQUIRED') relevanceScore += 30;
      else if (matchedReq.importance === 'PREFERRED') relevanceScore += 20;
    } else if (jobDescText.includes(name.toLowerCase()) || jobDescText.includes(slug)) {
      relevanceScore += 30;
    }

    if (provenanceStatus === 'VERIFIED') relevanceScore += 20;
    else if (provenanceStatus === 'CORROBORATED') relevanceScore += 15;
    else if (provenanceStatus === 'USER_PROVIDED') relevanceScore += 10;
    else if (provenanceStatus === 'CLAIMED') relevanceScore += 5;

    relevanceScore += Math.min(10, evidenceCount);

    candidateSkills.push({
      name,
      slug,
      provenanceStatus,
      evidenceId,
      evidenceRef: s.evidenceRef || (s.evidence && s.evidence[0]) || null,
      evidenceCount,
      relevanceScore,
      matchedRequirementId: matchedReq?.requirementId || null,
    });
  }

  candidateSkills.sort((a, b) => b.relevanceScore - a.relevanceScore || b.evidenceCount - a.evidenceCount);
  return candidateSkills;
}

/**
 * Synthesizes an evidence-grounded, job-tailored professional summary.
 * Guaranteed to reference only candidate-owned skills and projects, adhere to 1-page length constraints,
 * and attach full provenance metadata.
 *
 * @param {object} params
 * @param {object} params.candidateProfile Candidate profile domain object
 * @param {object} [params.jobPosting] Target job posting object
 * @param {object} [params.tailoringPlan] Pre-computed or incoming tailoring plan
 * @param {Array<object>} [params.selectedSkills] Authoritative selected skills from Batch 3
 * @param {Array<object>} [params.selectedProjects] Authoritative selected projects from Batch 2
 * @param {object} [params.matchAnalysis] Authoritative match analysis
 * @param {object} [params.options] Additional options
 * @returns {object} TailoredSummary object conforming to TailoredSummarySchema
 */
export function generateGroundedSummary({
  candidateProfile,
  jobPosting = null,
  tailoringPlan = null,
  selectedSkills = null,
  selectedProjects = null,
  matchAnalysis = null,
  options = {},
}) {
  if (!candidateProfile || typeof candidateProfile !== 'object') {
    throw new ValidationError('candidateProfile must be a valid object');
  }

  const meta = candidateProfile.profileMetadata || {};
  const targetRoleTitle =
    jobPosting?.title ||
    tailoringPlan?.targetRoleTitle ||
    options.targetRoleTitle ||
    candidateProfile.headline ||
    'Software Engineer';

  // 1. Gather Candidate-Owned Skills & Projects
  const rankedSkills = Array.isArray(selectedSkills) && selectedSkills.length > 0
    ? selectedSkills
    : extractRankedCandidateSkills(candidateProfile, jobPosting, matchAnalysis);

  const rawProjects = Array.isArray(selectedProjects) && selectedProjects.length > 0
    ? selectedProjects
    : (meta.projects || candidateProfile.projects || []);

  const jobDescText = String(
    (jobPosting?.title || '') +
      ' ' +
      (jobPosting?.description || '') +
      ' ' +
      (jobPosting?.requirements || []).join(' ') +
      ' ' +
      (jobPosting?.skills || []).join(' ')
  ).toLowerCase();

  // 2. Identify role focus (generic taxonomy over job text or options overrides)
  const roleFocus = options.roleFocus && typeof options.roleFocus === 'object'
    ? options.roleFocus
    : deriveRoleFocus(targetRoleTitle, jobDescText);
  const isBackendFocus = roleFocus.isBackendFocus;
  const isFrontendFocus = roleFocus.isFrontendFocus;

  // 3. Filter Candidate-Owned Relevant Skills
  let filteredSkills = [];
  if (isBackendFocus) {
    filteredSkills = rankedSkills.filter((s) => {
      const slug = s.slug.toLowerCase();
      return (
        slug.includes('python') ||
        slug.includes('fastapi') ||
        slug.includes('postgres') ||
        slug.includes('node') ||
        slug.includes('express') ||
        slug.includes('sql') ||
        slug.includes('api') ||
        slug.includes('rest') ||
        slug.includes('django') ||
        slug.includes('flask') ||
        s.relevanceScore > 40
      );
    });
  } else if (isFrontendFocus) {
    filteredSkills = rankedSkills.filter((s) => {
      const slug = s.slug.toLowerCase();
      return (
        slug.includes('react') ||
        slug.includes('typescript') ||
        slug.includes('next') ||
        slug.includes('javascript') ||
        slug.includes('html') ||
        slug.includes('css') ||
        slug.includes('ui') ||
        slug.includes('web') ||
        slug.includes('tailwind') ||
        s.relevanceScore > 40
      );
    });
  }

  if (filteredSkills.length === 0) {
    filteredSkills = rankedSkills.slice(0, 4);
  }

  // Pick top 3 distinct candidate-owned skills for summary
  const topSkills = filteredSkills.slice(0, 3);
  const referencedSkillSlugs = topSkills.map((s) => s.slug || slugifyTerm(s.name));

  // 4. Select Grounded Project Highlight — relevance-driven, not name-driven
  let topProject = null;
  if (rawProjects.length > 0) {
    const topSkillSlugs = new Set(topSkills.map((s) => s.slug || slugifyTerm(s.name)));
    const projectScore = (p) => {
      let score = typeof p.relevanceScore === 'number' ? p.relevanceScore : 0;
      const techSlugs = (p.technologies || []).map((t) => slugifyTerm(t));
      let overlap = 0;
      for (const ts of techSlugs) {
        if (topSkillSlugs.has(ts)) overlap += 1;
        else if (jobDescText.includes(ts)) overlap += 0.5;
      }
      score += overlap * 10;
      const bulletCount = Array.isArray(p.bullets) ? p.bullets.length : 0;
      score += Math.min(10, bulletCount * 3);
      score += Math.min(10, (p.evidenceCount || (Array.isArray(p.evidence) ? p.evidence.length : 0)) * 0.5);
      return score;
    };
    topProject = [...rawProjects].sort((a, b) => projectScore(b) - projectScore(a))[0] || rawProjects[0];
  }

  const referencedProjectIds = [];
  if (topProject) {
    const pId = topProject.id || topProject.projectId || topProject.name;
    if (pId) referencedProjectIds.push(String(pId));
  }

  // 5. Gather Evidence References & Requirement IDs
  const evidenceRefs = [];
  const matchedRequirementIds = [];

  for (const s of topSkills) {
    if (s.matchedRequirementId && !matchedRequirementIds.includes(s.matchedRequirementId)) {
      matchedRequirementIds.push(s.matchedRequirementId);
    }
    const ref = toEvidenceReference(
      s.evidenceRef || {
        evidenceId: s.evidenceId,
        filePath: 'skills/verified.json',
      },
      s.provenanceStatus
    );
    if (ref) evidenceRefs.push(ref);
  }

  if (topProject && Array.isArray(topProject.evidence) && topProject.evidence.length > 0) {
    for (const e of topProject.evidence.slice(0, 2)) {
      const ref = toEvidenceReference(e, topProject.provenanceStatus || 'VERIFIED');
      if (ref) evidenceRefs.push(ref);
    }
  }

  // 6. Synthesize Concise Text (2-3 sentences, <350 chars) strictly from candidate-owned facts
  const candidateExperience = candidateProfile.experience || meta.experience || [];
  const hasWorkHistory = Array.isArray(candidateExperience) && candidateExperience.length > 0;
  const isFresher = !hasWorkHistory || candidateProfile.careerStatus === 'FRESHER';

  let summaryText = '';
  const skillNames = topSkills.map((s) => s.name).filter(Boolean);
  const skillPhrase = skillNames.length > 0
    ? skillNames.slice(0, 3).join(', ')
    : null;
  const projectDisplayName = topProject ? (topProject.displayName || topProject.name || topProject.title) : null;

  if (topSkills.length === 0 && !topProject) {
    // Fail-closed safe fallback: use authentic candidate summary or grounded academic/background facts
    const existingSummary = candidateProfile.summary || meta.summary;
    if (existingSummary && existingSummary.trim().length > 0) {
      summaryText = existingSummary.trim();
    } else {
      const degree = candidateProfile.education?.[0]?.degree || meta.education?.[0]?.degree;
      const field = candidateProfile.education?.[0]?.fieldOfStudy || meta.education?.[0]?.fieldOfStudy;
      if (degree) {
        summaryText = `${targetRoleTitle} with academic foundation in ${field || degree}.`;
      } else {
        summaryText = `${targetRoleTitle} with verified technical background.`;
      }
    }
  } else {
    // Canonical role headline (seniority-adjusted, evidence-compatible) anchors the summary.
    const headingInfo = deriveTargetRoleHeading({ candidateProfile, jobPosting, matchAnalysis });
    const rolePhrase = headingInfo.heading || targetRoleTitle;
    summaryText = skillPhrase
      ? `${rolePhrase} with hands-on experience in ${skillPhrase}.`
      : `${rolePhrase} with hands-on project delivery.`;

    if (projectDisplayName) {
      const projectClause = buildProjectHighlightClause(topProject, roleFocus);
      summaryText += projectClause
        ? ` Recent work includes ${projectDisplayName}${projectClause}.`
        : ` Recent work includes ${projectDisplayName}.`;
    } else if (hasWorkHistory) {
      const latest = candidateExperience[0] || {};
      const latestRole = latest.title || latest.role || null;
      if (latestRole) {
        summaryText += ` Professional experience includes work as ${latestRole}.`;
      }
    }
  }

  // Ensure metric safety on synthesized summary
  assertMetricSafety(summaryText, evidenceRefs, {
    hasWorkHistoryTenure: !isFresher,
    sourceText: candidateProfile.summary || meta.summary || '',
  });

  // Determine overall provenance status
  const allVerified = topSkills.length > 0 && topSkills.every((s) => s.provenanceStatus === 'VERIFIED');
  const anyCorroborated = topSkills.some((s) => s.provenanceStatus === 'CORROBORATED');
  const provenanceStatus = allVerified ? 'VERIFIED' : anyCorroborated ? 'CORROBORATED' : 'CLAIMED';

  return {
    text: summaryText,
    referencedSkillSlugs,
    referencedProjectIds,
    evidenceRefs: evidenceRefs.slice(0, 5),
    matchedRequirementIds,
    provenanceStatus,
    provenance: evidenceRefs[0] || null,
  };
}

/**
 * Evaluates and ranks authentic project bullets against target job requirements,
 * attaching item-level evidence references and enforcing metric safety.
 *
 * @param {object} params
 * @param {object} params.project The candidate project record
 * @param {object} [params.jobPosting] Target job posting
 * @param {object} [params.matchAnalysis] Authoritative match analysis
 * @param {object} [params.options] Generation options
 * @returns {Array<object>} Tailored project bullets conforming to TailoredProjectBulletSchema
 */
export function selectAndRephraseProjectBullets({
  project,
  jobPosting = null,
  matchAnalysis = null,
  options = {},
}) {
  if (!project || typeof project !== 'object') {
    return [];
  }

  const rawBullets = Array.isArray(project.bullets) ? project.bullets : [];
  if (rawBullets.length === 0) {
    if (project.summary && typeof project.summary === 'string' && project.summary.trim()) {
      return [
        {
          text: project.summary.trim(),
          evidenceRefs: Array.isArray(project.evidence) ? project.evidence.slice(0, 2) : [],
          matchedRequirementIds: [],
          provenanceStatus: project.provenanceStatus || 'VERIFIED',
        },
      ];
    }
    return [];
  }

  const jobTerms = new Set();
  if (jobPosting) {
    const jobText = String(
      (jobPosting.title || '') +
        ' ' +
        (jobPosting.description || '') +
        ' ' +
        (jobPosting.requirements || []).join(' ') +
        ' ' +
        (jobPosting.skills || []).join(' ')
    ).toLowerCase();

    for (const word of jobText.split(/[^a-z0-9+#.]+/)) {
      if (word.length >= 3) jobTerms.add(word);
    }
  }

  const projectEvidence = Array.isArray(project.evidence) ? project.evidence : [];

  // 1. Score each bullet for relevance to target job
  const scoredBullets = rawBullets.map((bullet, idx) => {
    const bulletObj = typeof bullet === 'object' && bullet !== null ? bullet : { text: String(bullet) };
    const text = String(bulletObj.text || '').trim();

    let relevanceScore = 0;
    const bulletLower = text.toLowerCase();

    // Check overlap with job keywords
    for (const term of jobTerms) {
      if (bulletLower.includes(term)) {
        relevanceScore += 10;
      }
    }

    // Check project technology alignment
    for (const tech of project.technologies || []) {
      const techLower = String(tech).toLowerCase();
      if (bulletLower.includes(techLower)) {
        if (jobTerms.has(techLower)) relevanceScore += 25;
        else relevanceScore += 5;
      }
    }

    // Prefer bullets with code-backed evidence
    const bEvidenceRefs = Array.isArray(bulletObj.evidenceRefs) && bulletObj.evidenceRefs.length > 0
      ? bulletObj.evidenceRefs
      : projectEvidence.filter((e) => {
          const slug = e.skillSlug || slugifyTerm(e.skillName);
          return slug && bulletLower.includes(slug.replace(/-/g, ' '));
        });

    if (bEvidenceRefs.length > 0) {
      relevanceScore += 15;
    }

    // Preserve matched requirement IDs if present or derive from matchAnalysis
    const matchedRequirementIds = Array.isArray(bulletObj.matchedRequirementIds)
      ? [...bulletObj.matchedRequirementIds]
      : [];

    if (matchAnalysis?.skillMatches) {
      for (const m of matchAnalysis.skillMatches) {
        const name = (m.skillName || m.skillSlug || '').toLowerCase();
        if (name && bulletLower.includes(name) && m.requirementId && !matchedRequirementIds.includes(m.requirementId)) {
          matchedRequirementIds.push(m.requirementId);
        }
      }
    }

    return {
      text,
      origText: text,
      evidenceRefs: bEvidenceRefs.slice(0, 5),
      matchedRequirementIds,
      provenanceStatus: bulletObj.provenanceStatus || project.provenanceStatus || 'VERIFIED',
      relevanceScore,
      origIndex: idx,
    };
  });

  // 2. Sort by relevance score descending, preserving relative order on ties
  scoredBullets.sort((a, b) => b.relevanceScore - a.relevanceScore || a.origIndex - b.origIndex);

  // 2b. Evidence-grounded pool expansion: when the authored bullet pool is
  // thin (< 2 bullets) and the project carries richer source-level evidence
  // than the authored bullets express, synthesize additional candidate-owned
  // bullets strictly from verified evidence records. Selection stays within
  // the caller-supplied budget (options.maxBullets, default 4).
  //
  // INVARIANT (Phase 3): candidate-authored bullets are the primary pool and
  // are NEVER displaced by evidence-derived bullets. Derived bullets fill only
  // the remaining budget. This prevents the historical content-starvation bug
  // where generic derived wording crowded authentic bullets out of the
  // renderer's per-project bullet cap.
  const maxBullets = options.maxBullets || 4;
  const targetPoolSize = Math.max(maxBullets, 2);
  if (scoredBullets.length < Math.min(2, targetPoolSize)) {
    const derivedBullets = deriveEvidenceBackedBullets(
      project,
      scoredBullets,
      jobTerms,
      targetPoolSize
    );
    scoredBullets.push(...derivedBullets);
  }

  const authoredScored = scoredBullets
    .filter((b) => !b.isEvidenceDerived)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.origIndex - b.origIndex);
  const derivedScored = scoredBullets
    .filter((b) => b.isEvidenceDerived)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.origIndex - b.origIndex);

  // 3. Optional Rephrasing & Metric Safety Enforcement
  // Selection order: all authored bullets first (up to budget), then the
  // strongest evidence-derived fillers for any remaining budget slots.
  const selected = [...authoredScored, ...derivedScored].slice(0, maxBullets);

  const resultBullets = [];
  for (const item of selected) {
    let bulletText = item.text;

    if (options.rephrase && typeof options.rephraseFn === 'function') {
      try {
        const proposed = options.rephraseFn(item.text);
        validateRephrasingSafety(item.text, proposed, project);
        bulletText = proposed;
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        // Fall back to original authentic bullet on rephrasing failure
        bulletText = item.text;
      }
    }

    // Assert metric safety on each final bullet. Evidence-derived bullets
    // (origText === null) are exempt from the source-text pass-through because
    // their text is constructed purely from evidence-verified facts.
    assertMetricSafety(
      bulletText,
      item.evidenceRefs,
      item.origText !== null ? { sourceText: item.origText } : {}
    );

    const normalizedRefs = (item.evidenceRefs || [])
      .map((r) => toEvidenceReference(r, item.provenanceStatus))
      .filter(Boolean);

    resultBullets.push({
      text: bulletText,
      evidenceRefs: normalizedRefs,
      matchedRequirementIds: item.matchedRequirementIds,
      provenanceStatus: item.provenanceStatus,
    });
  }

  return resultBullets;
}

/**
 * Normalizes raw job posting titles to clean, professional, concise presentation titles:
 * - Strips trailing employer/team specifiers (e.g., ", Growth", " - Growth", ", DataHybrid")
 * - Strips work arrangement tags (e.g. "(Remote)", "(Hybrid)", " - Remote")
 * - Standardizes common phrasing (e.g. "Full Stack" -> "Full-Stack")
 * - Preserves technical specializations (e.g., "Python Backend Engineer")
 *
 * @param {string} rawTitle
 * @returns {string}
 */
export function normalizeTargetRoleTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return 'Software Engineer';
  let title = rawTitle.trim();
  if (!title) return 'Software Engineer';

  // 1. Remove parenthetical or trailing location/work arrangement indicators (generic regex)
  title = title.replace(/\s*\((?:remote|hybrid|onsite|on-site)\)/gi, '');
  title = title.replace(/\s*[-–—,|]?\s*(?:remote|hybrid|onsite|on-site)\s*$/gi, '');
  title = title.replace(/,\s*[^,]*\b(?:hybrid|remote|onsite|on-site)\b[^,]*$/gi, '');

  // 2. Remove trailing department / team specifiers
  title = title.replace(/,\s*(?:growth|core team|product team|engineering team|us|uk|emea|apac)\b.*$/gi, '');
  title = title.replace(/\s*[-–—]\s*(?:growth|core team|product team|engineering team|us|uk|emea|apac)\s*$/gi, '');

  // 2b. Generic canonical-role rule: strip ANY remaining trailing qualification
  // clause (", <Team/Domain/Specialty>"). The canonical headline must be a
  // concise role title, not the full employer posting string. Specializations
  // that survive the core-title simplification are expressed through the
  // evidence-compatibility logic in deriveTargetRoleHeading, not by copying
  // posting qualifiers verbatim.
  title = title.replace(/,\s*[^,]+$/, '').trim();

  // 4. Strip generic employer-attachment patterns: ", <Team> at <Company>" and " at <Company>"
  // (canonical role text must not carry employer-specific attachments)
  title = title.replace(/,\s*[^,]+?\s+at\s+[^,]+$/, '');
  title = title.replace(/\s+at\s+[^,\s][^,]*$/, '');

  // 4b. Clean trailing punctuation / dashes
  title = title.replace(/\s*[-–—,]\s*$/, '').trim();

  // 5. Normalize spacing and common role terminology
  title = title.replace(/\s+/g, ' ');
  title = title.replace(/\bFull\s+Stack\b/gi, 'Full-Stack');
  title = title.replace(/\bBack\s+End\b/gi, 'Backend');
  title = title.replace(/\bFront\s+End\b/gi, 'Frontend');

  return title || 'Software Engineer';
}

/**
 * Derives an evidence-compatible target role resume heading:
 * - Analyzes candidate seniority and career status
 * - Prevents unsupported seniority inflation (strips Senior, Principal, Lead, Staff for freshers/juniors)
 * - Retains meaningful specialization when supported by candidate evidence
 * - Deterministic and non-mutating
 *
 * @param {object} params
 * @param {object} params.candidateProfile
 * @param {object} [params.jobPosting]
 * @param {object} [params.matchAnalysis]
 * @returns {{ heading: string, rawTitle: string, seniorityAdjusted: boolean, candidateSeniority: string, candidateArchetype: string }}
 */
export function deriveTargetRoleHeading({ candidateProfile, jobPosting = null, matchAnalysis = null }) {
  const profile = candidateProfile || {};
  const meta = profile.profileMetadata || {};
  const experiences = meta.experience || profile.experience || profile.workExperience || [];
  const education = meta.education || profile.education || [];

  // 1. Derive candidate seniority and career status
  const tenureMetrics = TenureCalculator.calculateTenure(experiences);
  const candidateSeniority = CareerStatusDerivation.deriveSeniority({
    experiences,
    education,
    professionalTenureYears: tenureMetrics.professionalTenureYears,
    declaredSeniority: profile.seniority || meta.seniority || meta.userCustom?.seniority,
  });

  const careerStatus = CareerStatusDerivation.deriveCareerStatus({
    experiences,
    education,
    professionalTenureMonths: tenureMetrics.professionalTenureMonths,
    declaredStatus: profile.careerStatus || meta.careerStatus || meta.userCustom?.careerStatus,
  });

  const hasSeniorWorkHistory = experiences.some((e) =>
    /\b(senior|sr\.?|principal|lead|staff|architect|director|manager)\b/i.test(e.title || e.role || '')
  );
  const hasSeniorHeadline = /\b(senior|sr\.?|principal|lead|staff|architect|director)\b/i.test(
    profile.headline || meta.headline || ''
  );

  const isFresher =
    !hasSeniorWorkHistory &&
    !hasSeniorHeadline &&
    (careerStatus === 'FRESHER' ||
      profile.careerStatus === 'FRESHER' ||
      meta.careerStatus === 'FRESHER' ||
      candidateSeniority === 'ENTRY_LEVEL' ||
      candidateSeniority === 'INTERN' ||
      (tenureMetrics.professionalTenureYears < 1.0 && experiences.length === 0));

  // 2. Candidate evidence capabilities
  const candidateSkills = new Set(
    (profile.skills || []).map((s) => (typeof s === 'string' ? slugifyTerm(s) : slugifyTerm(s.slug || s.name)))
  );
  if (matchAnalysis?.skillMatches) {
    for (const m of matchAnalysis.skillMatches) {
      const slug = slugifyTerm(m.skillName || m.skillSlug);
      if (slug) candidateSkills.add(slug);
    }
  }

  const candidateProjects = profile.projects || [];
  const projectTechs = new Set(
    candidateProjects.flatMap((p) => (p.technologies || []).map((t) => slugifyTerm(t)))
  );

  const hasBackendEvidence =
    [...candidateSkills, ...projectTechs].some((s) =>
      ['python', 'fastapi', 'node', 'nodejs', 'postgres', 'postgresql', 'backend', 'api', 'apis', 'django', 'flask', 'express', 'sql', 'rest', 'graphql'].includes(s)
    );
  const hasFrontendEvidence =
    [...candidateSkills, ...projectTechs].some((s) =>
      ['react', 'typescript', 'javascript', 'nextjs', 'next.js', 'vue', 'angular', 'html', 'css', 'tailwind', 'ui', 'frontend'].includes(s)
    );
  const hasFullStackEvidence = hasBackendEvidence && hasFrontendEvidence;

  // 3. Raw target title from job posting
  const rawJobTitle = jobPosting?.title ? String(jobPosting.title).trim() : null;

  let heading = '';
  let seniorityAdjusted = false;

  if (rawJobTitle) {
    let normalized = normalizeTargetRoleTitle(rawJobTitle);

    // Seniority inflation protection:
    // If candidate is a fresher / entry-level / intern, disallow Senior, Principal, Lead, Staff, etc.
    const isSeniorJobTitle = /\b(senior|sr\.?|principal|lead|staff|director|head of|vp)\b/i.test(normalized);
    if (isFresher && isSeniorJobTitle) {
      normalized = normalized.replace(/\b(senior|sr\.?|principal|lead|staff|director|head of|vp)\b\s*/gi, '').trim();
      seniorityAdjusted = true;
    }

    // Evidence compatibility check:
    const isBackendRole = /\bbackend\b/i.test(normalized);
    const isFrontendRole = /\bfrontend\b/i.test(normalized);
    const isFullStackRole = /\bfull-stack\b/i.test(normalized);

    if (isFullStackRole && !hasFullStackEvidence && (hasBackendEvidence || hasFrontendEvidence)) {
      if (hasBackendEvidence) normalized = normalized.replace(/\bfull-stack\b/i, 'Backend');
      else if (hasFrontendEvidence) normalized = normalized.replace(/\bfull-stack\b/i, 'Frontend');
    } else if (isBackendRole && !hasBackendEvidence && hasFrontendEvidence) {
      normalized = normalized.replace(/\bbackend\b/i, 'Frontend');
    } else if (isFrontendRole && !hasFrontendEvidence && hasBackendEvidence) {
      normalized = normalized.replace(/\bfrontend\b/i, 'Backend');
    }

    // Clean any trailing or double spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    if (!normalized || /^(?:developer|engineer)$/i.test(normalized)) {
      normalized = 'Software Engineer';
    }

    heading = normalized;
  } else {
    // No job posting provided: use candidate profile headline safely
    const profileHeadline = profile.headline || meta.headline || meta.userCustom?.headline;
    if (profileHeadline && typeof profileHeadline === 'string' && profileHeadline.trim()) {
      let curated = profileHeadline.trim();
      if (isFresher) {
        curated = curated.replace(/\b(senior|sr\.?|principal|lead|staff|director|head of|vp)\b\s*/gi, '').trim();
      }
      heading = curated;
    } else if (hasFullStackEvidence) {
      heading = 'Full-Stack Software Engineer';
    } else if (hasBackendEvidence) {
      heading = 'Backend Engineer';
    } else if (hasFrontendEvidence) {
      heading = 'Frontend Engineer';
    } else {
      heading = 'Software Engineer';
    }
  }

  const candidateArchetype =
    profile.careerStatus === 'CAREER_CHANGER' || meta.careerStatus === 'CAREER_CHANGER'
      ? 'CAREER_CHANGER'
      : isFresher
        ? 'FRESHER'
        : 'EXPERIENCED';

  return {
    heading,
    rawTitle: rawJobTitle || heading,
    seniorityAdjusted,
    candidateSeniority,
    candidateArchetype,
  };
}

/**
 * Derives section ordering based on candidate archetype and available evidence:
 * - Entry-level / Fresher: SUMMARY -> SKILLS -> PROJECTS -> (DSA) -> EXPERIENCE -> EDUCATION
 * - Experienced: SUMMARY -> SKILLS -> EXPERIENCE -> PROJECTS -> (DSA) -> EDUCATION
 * - Career Changer: SUMMARY -> SKILLS -> PROJECTS -> EXPERIENCE -> EDUCATION
 * - Optional sections (DSA, CERTIFICATIONS, COURSEWORK, PUBLICATIONS) are included ONLY if non-empty and meaningful
 *
 * @param {object} params
 * @param {object} params.candidateProfile
 * @param {object} [params.jobPosting]
 * @param {object} [params.options]
 * @returns {{ sectionOrder: string[], candidateArchetype: string }}
 */
export function deriveSectionOrdering({ candidateProfile, jobPosting = null, options = {} }) {
  const profile = candidateProfile || {};
  const meta = profile.profileMetadata || {};
  const experiences = meta.experience || profile.experience || profile.workExperience || [];
  const education = meta.education || profile.education || [];
  const certifications = meta.certifications || profile.certifications || [];
  // DSA detection MUST match the structured snapshot builder's alias resolution
  // (structured-resume.service.js: meta.dsa || source.dsa || source.problemSolving || meta.problemSolving).
  // The real candidate flow attaches DSA under the top-level 'problemSolving' alias;
  // missing it here silently drops DSA from sectionOrder while structuredResume.dsa stays populated.
  const dsa =
    meta.dsa ||
    profile.dsa ||
    profile.problemSolving ||
    meta.problemSolving ||
    meta.resumeData?.problemSolving ||
    null;

  const tenureMetrics = TenureCalculator.calculateTenure(experiences);
  const candidateSeniority = CareerStatusDerivation.deriveSeniority({
    experiences,
    education,
    professionalTenureYears: tenureMetrics.professionalTenureYears,
    declaredSeniority: profile.seniority || meta.seniority || meta.userCustom?.seniority,
  });

  const careerStatus = CareerStatusDerivation.deriveCareerStatus({
    experiences,
    education,
    professionalTenureMonths: tenureMetrics.professionalTenureMonths,
    declaredStatus: profile.careerStatus || meta.careerStatus || meta.userCustom?.careerStatus,
  });

  const hasSeniorWorkHistory = experiences.some((e) =>
    /\b(senior|sr\.?|principal|lead|staff|architect|director|manager)\b/i.test(e.title || e.role || '')
  );
  const hasSeniorHeadline = /\b(senior|sr\.?|principal|lead|staff|architect|director)\b/i.test(
    profile.headline || meta.headline || ''
  );

  let isFresher =
    !hasSeniorWorkHistory &&
    !hasSeniorHeadline &&
    (careerStatus === 'FRESHER' ||
      profile.careerStatus === 'FRESHER' ||
      meta.careerStatus === 'FRESHER' ||
      candidateSeniority === 'ENTRY_LEVEL' ||
      candidateSeniority === 'INTERN' ||
      (tenureMetrics.professionalTenureYears < 1.0 && experiences.length === 0));

  // Role hint evaluation from jobPosting
  if (jobPosting?.title && !hasSeniorWorkHistory) {
    const jobTitle = String(jobPosting.title).toLowerCase();
    if (/\b(intern|internship|graduate|junior|entry|associate)\b/i.test(jobTitle)) {
      isFresher = true;
    }
  }

  let candidateArchetype =
    options.candidateArchetype ||
    (profile.careerStatus === 'CAREER_CHANGER' || meta.careerStatus === 'CAREER_CHANGER' || profile.archetype === 'CAREER_CHANGER'
      ? 'CAREER_CHANGER'
      : isFresher
        ? 'FRESHER'
        : 'EXPERIENCED');

  // Check optional sections: ONLY include if non-empty and meaningful (Req G)
  const hasDsa = isMeaningfulDsa(dsa);
  const hasCertifications = Boolean(Array.isArray(certifications) && certifications.length > 0);
  const hasCoursework = Boolean(
    (Array.isArray(education) && education.some((e) => Array.isArray(e.coursework) && e.coursework.length > 0)) ||
    (Array.isArray(profile.coursework) && profile.coursework.length > 0)
  );
  const hasPublications = Boolean(Array.isArray(profile.publications) && profile.publications.length > 0);

  const sectionOrder = ['HEADER', 'SUMMARY', 'SKILLS'];

  if (candidateArchetype === 'FRESHER' || candidateArchetype === 'CAREER_CHANGER') {
    // Project-heavy fresher / career changer: Projects precede Experience
    sectionOrder.push('PROJECTS');
    if (hasDsa) sectionOrder.push('DSA');
    sectionOrder.push('EXPERIENCE');
    sectionOrder.push('EDUCATION');
  } else {
    // Experienced: Experience precedes Projects
    sectionOrder.push('EXPERIENCE');
    sectionOrder.push('PROJECTS');
    if (hasDsa) sectionOrder.push('DSA');
    sectionOrder.push('EDUCATION');
  }

  if (hasCertifications) sectionOrder.push('CERTIFICATIONS');
  if (hasCoursework) sectionOrder.push('COURSEWORK');
  if (hasPublications) sectionOrder.push('PUBLICATIONS');

  return {
    sectionOrder,
    candidateArchetype,
  };
}

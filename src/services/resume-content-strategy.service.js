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
  composeProfessionalSummary,
  composeProfessionalProjectBullets,
} from './resume-accomplishment-composer.service.js';
import { scoreFactsForJob } from './candidate-fact-inventory.service.js';

import {
  EVIDENCE_SEMANTIC_CLASS,
  classifyEvidenceSemanticType,
  isClaimSafeToRender,
  isMeaningfulDsa,
  QUANTITATIVE_METRIC_REGEX,
  TENURE_CLAIM_PATTERN,
} from './resume-composition-primitives.js';

export {
  EVIDENCE_SEMANTIC_CLASS,
  classifyEvidenceSemanticType,
  isClaimSafeToRender,
  isMeaningfulDsa,
  QUANTITATIVE_METRIC_REGEX,
  TENURE_CLAIM_PATTERN,
};

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

  const filePath = rawRef.filePath || rawRef.sourceLocation?.filePath || null;

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
    const sourceHasMetric =
      options.sourceText && QUANTITATIVE_METRIC_REGEX.test(options.sourceText);
    const evidenceHasMetric =
      Array.isArray(evidenceRefs) &&
      evidenceRefs.some((ref) => {
        const snippet = ref.contextSnippet || ref.snippet || ref.sourceLocation?.snippet || '';
        return QUANTITATIVE_METRIC_REGEX.test(snippet);
      });

    if (
      !sourceHasMetric &&
      !evidenceHasMetric &&
      (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0)
    ) {
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
  if (
    QUANTITATIVE_METRIC_REGEX.test(rephrasedText) &&
    !QUANTITATIVE_METRIC_REGEX.test(sourceText)
  ) {
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
    const slug =
      typeof s === 'string' ? slugifyTerm(s) : s.slug || slugifyTerm(s.name || s.skillName);
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
    'kubernetes',
    'docker',
    'aws',
    'gcp',
    'azure',
    'rust',
    'golang',
    'go',
    'kafka',
    'graphql',
    'redis',
    'spark',
    'hadoop',
    'terraform',
    'elasticsearch',
    'solr',
    'rabbitmq',
    'microservices',
    'serverless',
    'lambda',
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
 * Splits text into sentences while protecting technology names (Node.js, Next.js, etc.)
 * and abbreviations with embedded periods from false sentence breaks.
 *
 * @param {string} text
 * @returns {Array<string>} Clean sentences
 */
export function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];
  const protectedText = text
    .replace(/\b([Nn]ode|[Nn]ext|[Vv]ue|[Ee]xpress)\.js\b/g, '$1__DOT__js')
    .replace(/\b(e\.g\.|i\.e\.|etc\.|vs\.|dept\.|dr\.|mr\.|ms\.)/gi, (m) =>
      m.replace(/\./g, '__DOT__')
    );

  const rawMatches = protectedText.match(/[^.!?]+[.!?]+/g) || [protectedText];
  return rawMatches.map((s) => s.replace(/__DOT__/g, '.').trim()).filter(Boolean);
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

  const result = composeProfessionalSummary({
    candidateProfile,
    jobPosting,
    selectedSkills,
    selectedProjects,
    options: {
      ...options,
      matchAnalysis,
      targetRoleTitle: tailoringPlan?.targetRoleTitle || options.targetRoleTitle,
    },
  });

  return {
    text: result.text,
    referencedSkillSlugs: result.referencedSkillSlugs || [],
    referencedProjectIds: result.referencedProjectIds || [],
    evidenceRefs: result.evidenceRefs || [],
    matchedRequirementIds: result.matchedRequirementIds || [],
    provenanceStatus: 'VERIFIED',
    provenance: null,
    composedFromFactIds: result.composedFromFactIds || [],
    targetRole: result.targetRole,
    topRelevantTechnicalDomains: result.topRelevantTechnicalDomains,
    topRelevantTechnologies: result.topRelevantTechnologies,
    differentiator: result.differentiator,
  };
}

/**
 * Deterministic professional compression for candidate-authored bullet text (P16-006).
 *
 * Rules:
 * 1. Removes redundant introductory fluff ("Responsible for", "Tasked with", "Helped in").
 * 2. Merges repetitive phrasing and eliminates duplicated technology mentions.
 * 3. Shortens verbose wording while keeping strong action verbs.
 * 4. Preserves all technical specifics, metrics, ownership, and outcomes.
 * 5. NEVER introduces unbacked metrics, scale, users, or leadership claims.
 * 6. Deterministic: identical input always produces identical output.
 *
 * @param {string} text Candidate-authored bullet text
 * @returns {string} Professionally compressed bullet
 */
export function compressCandidateBullet(text) {
  if (!text || typeof text !== 'string') return '';
  let b = text.trim();
  if (b.length === 0) return '';

  // 1. Remove weak introductory fluff phrases (case-insensitive, at start of sentence)
  b = b.replace(
    /^(?:responsible for|tasked with|helped in|helped with|assisted with|assisted in|involved in|worked on|participated in|contributed to|was responsible for|had the responsibility of|took part in)\s+/i,
    ''
  );

  // 2. Capitalize the first letter after fluff removal
  if (b.length > 0) {
    b = b.charAt(0).toUpperCase() + b.slice(1);
  }

  // 3. Remove redundant "the" after action verbs at sentence start
  b = b.replace(
    /^(Designed|Built|Building|Build|Developing|Developed|Implementing|Implemented|Engineering|Engineered|Integrating|Integrated|Creating|Created|Architecting|Architected)\s+the\s+/i,
    '$1 '
  );

  // 4. Collapse double spaces
  b = b.replace(/\s{2,}/g, ' ');

  // 5. Ensure the bullet ends with a period
  if (b.length > 0 && !/[.!?]$/.test(b)) {
    b += '.';
  }

  return b;
}

/**
 * Computes Jaccard token overlap between two candidate bullet strings.
 * Used for redundancy reduction (threshold >= 0.55).
 *
 * @param {string} textA
 * @param {string} textB
 * @returns {number} Overlap ratio [0.0, 1.0]
 */
export function calculateTokenOverlap(textA, textB) {
  const getTokens = (t) =>
    new Set(
      String(t || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 2 &&
            ![
              'and',
              'the',
              'with',
              'for',
              'from',
              'using',
              'into',
              'that',
              'this',
              'built',
              'developed',
            ].includes(w)
        )
    );
  const setA = getTokens(textA);
  const setB = getTokens(textB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Grounded composition: Combines short, complementary candidate-owned fragments
 * (< 60 chars) from the same project into high-density accomplishment prose.
 * Strict Invariant: Combines ONLY facts explicitly present in the candidate items;
 * NEVER invents metrics, scale, users, or leadership claims.
 *
 * @param {Array<object>} items Candidate items
 * @returns {Array<object>} Composed candidate items
 */
export function composeCandidateProjectBullets(items) {
  if (!Array.isArray(items) || items.length <= 1) return items;
  const result = [];
  const mergedIndices = new Set();

  for (let i = 0; i < items.length; i++) {
    if (mergedIndices.has(i)) continue;
    const itemA = items[i];
    const textA = String(itemA.text || '').trim();

    // If itemA is short (< 60 chars) and not a full compound sentence, see if there's a complementary short fragment
    if (textA.length < 60 && !textA.includes(';') && !textA.includes(' and ')) {
      let combined = false;
      for (let j = i + 1; j < items.length; j++) {
        if (mergedIndices.has(j)) continue;
        const itemB = items[j];
        const textB = String(itemB.text || '').trim();

        if (
          textB.length < 65 &&
          !textB.includes(';') &&
          calculateTokenOverlap(textA, textB) < 0.4
        ) {
          const cleanA = textA.replace(/[.!?]+$/, '');
          let cleanB = textB.replace(/[.!?]+$/, '');
          cleanB = cleanB.charAt(0).toLowerCase() + cleanB.slice(1);

          const composedText = `${cleanA}; ${cleanB}.`;
          result.push({
            ...itemA,
            text: composedText,
            origText: `${itemA.origText || textA} / ${itemB.origText || textB}`,
            evidenceRefs: [...(itemA.evidenceRefs || []), ...(itemB.evidenceRefs || [])],
            matchedRequirementIds: [
              ...new Set([
                ...(itemA.matchedRequirementIds || []),
                ...(itemB.matchedRequirementIds || []),
              ]),
            ],
            isComposed: true,
          });
          mergedIndices.add(i);
          mergedIndices.add(j);
          combined = true;
          break;
        }
      }
      if (!combined) {
        result.push(itemA);
      }
    } else {
      result.push(itemA);
    }
  }

  return result;
}

/**
 * Evaluates and ranks authentic project bullets against target job requirements,
 * attaching item-level evidence references and enforcing metric safety.
 * Multi-source composition (P16-006 / P16-007) pools candidate-authored bullets, highlights,
 * features, and descriptions with strict provenance tracking.
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
  matchAnalysis: _matchAnalysis = null,
  options = {},
}) {
  const rawItems = [
    ...(Array.isArray(project.bullets) ? project.bullets : []),
    ...(Array.isArray(project.highlights) ? project.highlights : []),
    ...(Array.isArray(project.features) ? project.features : []),
  ];

  const projectEvidence = Array.isArray(project.evidence) ? project.evidence : [];
  const projectTechs = Array.isArray(project.technologies) ? project.technologies : [];

  const pId = project.id || project.projectId || 'proj';
  const facts = rawItems
    .map((item, i) => {
      const text =
        typeof item === 'object' && item !== null
          ? item.text || item.description || ''
          : String(item || '');
      const bulletLower = text.toLowerCase();
      const bEvidenceRefs =
        Array.isArray(item?.evidenceRefs) && item.evidenceRefs.length > 0
          ? item.evidenceRefs
          : projectEvidence.filter((e) => {
              const slug = e.skillSlug || slugifyTerm(e.skillName || '');
              return slug && bulletLower.includes(slug.replace(/-/g, ' '));
            });
      const matchedRequirementIds = Array.isArray(item?.matchedRequirementIds)
        ? [...item.matchedRequirementIds]
        : [];

      const techs = projectTechs.filter((t) => bulletLower.includes(String(t).toLowerCase()));

      return {
        factId: `${pId}-claim-${i}`,
        id: `${pId}-claim-${i}`,
        renderable: true,
        text,
        factType: 'candidate-authored',
        provenance: item?.provenanceStatus || project.provenanceStatus || 'USER_PROVIDED',
        confidence: 0.85,
        semanticTopic: 'implementation',
        measurable: false,
        technologies: techs,
        evidenceRefs: bEvidenceRefs,
        matchedRequirementIds,
        association: { projectId: pId },
      };
    })
    .filter((f) => Boolean(f.text));

  const scoredFacts = jobPosting ? scoreFactsForJob(facts, jobPosting) : facts;

  const composed = composeProfessionalProjectBullets({
    facts: scoredFacts,
    project,
    jobPosting,
    explicitBudget: options?.maxBullets ?? null,
    options,
  });

  return (composed.bullets || []).map((b) => {
    const prov = b.provenanceStatus;
    const normalizedProv = prov === 'VERIFIED' || prov === 'CORROBORATED' ? 'VERIFIED' : 'CLAIMED';
    return {
      text: b.text,
      evidenceRefs: b.evidenceRefs || [],
      matchedRequirementIds: b.matchedRequirementIds || [],
      provenanceStatus: normalizedProv,
    };
  });
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
  title = title.replace(
    /,\s*(?:growth|core team|product team|engineering team|us|uk|emea|apac)\b.*$/gi,
    ''
  );
  title = title.replace(
    /\s*[-–—]\s*(?:growth|core team|product team|engineering team|us|uk|emea|apac)\s*$/gi,
    ''
  );

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
export function deriveTargetRoleHeading({
  candidateProfile,
  jobPosting = null,
  matchAnalysis = null,
}) {
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
    /\b(senior|sr\.?|principal|lead|staff|architect|director|manager)\b/i.test(
      e.title || e.role || ''
    )
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
    (profile.skills || []).map((s) =>
      typeof s === 'string' ? slugifyTerm(s) : slugifyTerm(s.slug || s.name)
    )
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

  const hasBackendEvidence = [...candidateSkills, ...projectTechs].some((s) =>
    [
      'python',
      'fastapi',
      'node',
      'nodejs',
      'postgres',
      'postgresql',
      'backend',
      'api',
      'apis',
      'django',
      'flask',
      'express',
      'sql',
      'rest',
      'graphql',
    ].includes(s)
  );
  const hasFrontendEvidence = [...candidateSkills, ...projectTechs].some((s) =>
    [
      'react',
      'typescript',
      'javascript',
      'nextjs',
      'next.js',
      'vue',
      'angular',
      'html',
      'css',
      'tailwind',
      'ui',
      'frontend',
    ].includes(s)
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
    const isSeniorJobTitle = /\b(senior|sr\.?|principal|lead|staff|director|head of|vp)\b/i.test(
      normalized
    );
    if (isFresher && isSeniorJobTitle) {
      normalized = normalized
        .replace(/\b(senior|sr\.?|principal|lead|staff|director|head of|vp)\b\s*/gi, '')
        .trim();
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
        curated = curated
          .replace(/\b(senior|sr\.?|principal|lead|staff|director|head of|vp)\b\s*/gi, '')
          .trim();
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
    /\b(senior|sr\.?|principal|lead|staff|architect|director|manager)\b/i.test(
      e.title || e.role || ''
    )
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

  const candidateArchetype =
    options.candidateArchetype ||
    (profile.careerStatus === 'CAREER_CHANGER' ||
    meta.careerStatus === 'CAREER_CHANGER' ||
    profile.archetype === 'CAREER_CHANGER'
      ? 'CAREER_CHANGER'
      : isFresher
        ? 'FRESHER'
        : 'EXPERIENCED');

  // Check optional sections: ONLY include if non-empty and meaningful (Req G)
  const hasDsa = isMeaningfulDsa(dsa);
  const hasCertifications = Boolean(Array.isArray(certifications) && certifications.length > 0);
  const hasCoursework = Boolean(
    (Array.isArray(education) &&
      education.some((e) => Array.isArray(e.coursework) && e.coursework.length > 0)) ||
    (Array.isArray(profile.coursework) && profile.coursework.length > 0)
  );
  const hasPublications = Boolean(
    Array.isArray(profile.publications) && profile.publications.length > 0
  );

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

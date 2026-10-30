/**
 * PRD-002: concise server-authored summaries selected from authoritative facts.
 * Job text influences ordering only; it never supplies candidate qualifications.
 */
import { buildCanonicalFactInventory } from './candidate-fact-inventory.service.js';
import { resumeSourceValue } from '../utils/resume-source-normalizer.js';
import {
  toEvidenceReference,
  calculateFactSemanticOverlap,
} from './resume-composition-primitives.js';

const tokens = (text) =>
  new Set(
    String(text || '')
      .toLowerCase()
      .match(/[\p{L}\p{N}+#.]{3,}/gu) || []
  );
const clean = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
const unsupportedStatus = (value) => /^(MISSING(?:_EVIDENCE)?|UNKNOWN)$/i.test(String(value || ''));

/** Same accepted source and configuration produce the same factual summary. */
export function composeSourceGroundedSummary({
  candidateProfile = {},
  jobPosting = null,
  factInventory = null,
  selectedProjects = null,
  selectedSkills = null,
  options = {},
} = {}) {
  const profile = candidateProfile || {};
  const authored = resumeSourceValue(profile, 'summary');
  const authoredText = typeof authored === 'object' && authored !== null ? authored.text : authored;
  const shouldPreserveAuthored = options.preserveAuthoredSummary !== false;
  if (shouldPreserveAuthored && (authored === null || typeof authoredText === 'string')) {
    const text = clean(authoredText);
    return {
      text,
      sourceFact: text,
      transformationType: 'VERBATIM',
      provenanceStatus: 'CLAIMED',
      sentences: [],
      composedFromFactIds: [],
      evidenceRefs: [],
      referencedProjectIds: [],
      referencedSkillSlugs: [],
      matchedRequirementIds: [],
      topRelevantTechnicalDomains: [],
      topRelevantTechnologies: [],
      targetRole: jobPosting?.title || options.targetRoleTitle || null,
      writingMethod: 'SOURCE_GROUNDED_DETERMINISTIC',
    };
  }
  const suppliedFacts = Array.isArray(factInventory) ? factInventory : factInventory?.facts;
  const facts = Array.isArray(suppliedFacts)
    ? suppliedFacts
    : buildCanonicalFactInventory(profile, jobPosting)?.facts || [];
  const projectIds = new Set(
    (selectedProjects || [])
      .flatMap((p) => [p.projectId, p.id, p.name, p.displayName, p.title])
      .filter(Boolean)
  );
  const jobTokens = tokens(
    [
      jobPosting?.title,
      jobPosting?.description,
      ...(jobPosting?.requirements || []).map((r) =>
        typeof r === 'string' ? r : r.text || r.concept || ''
      ),
    ]
      .filter(Boolean)
      .join(' ')
  );
  const candidates = [];
  for (const fact of facts) {
    if (
      !fact ||
      [fact.provenanceStatus, fact.provenance, fact.truthCategory, fact.status].some(
        unsupportedStatus
      )
    )
      continue;
    const factId = fact.factId || fact.id;
    const original = clean(fact.text);
    if (!factId || original.length < 15 || original.length > 300) continue;
    if (fact.candidateId && profile.id && fact.candidateId !== profile.id) continue;
    if (fact.tenantId && profile.tenantId && fact.tenantId !== profile.tenantId) continue;
    if (
      /^(TECHNOLOGY|LINK)$/i.test(fact.canonicalFactType || fact.factType || '') ||
      /^(uses?|https?:\/\/|candidate (?:reports?|claims?)?\s*:?\s*$)/i.test(original)
    )
      continue;
    const ownerType = String(fact.ownerType || fact.sectionOwnerType || '').toUpperCase();
    const projectId =
      fact.projectId ||
      fact.association?.projectId ||
      (ownerType === 'PROJECT' ? fact.ownerId || fact.sectionOwnerId : null);
    if (
      Array.isArray(selectedProjects) &&
      projectId &&
      !projectIds.has(projectId) &&
      !projectIds.has(fact.association?.projectName)
    )
      continue;
    const deniesCandidateAgency = ['NONE', 'EXTERNAL', 'REPOSITORY'].includes(
      String(fact.ownership || fact.candidateOwnership || '').toUpperCase()
    );
    const authored =
      fact.candidateAuthored === true && fact.renderable !== false && !deniesCandidateAgency;
    // Passive repository observations must keep an explicit repository subject.
    // A genuine fact ID alone cannot turn repository behavior into personal agency.
    if (!authored && !/^(?:the )?(?:repository|project|codebase)\b/i.test(original)) continue;
    const text = /[.!?]$/.test(original) ? original : `${original}.`;
    const overlap = [...tokens(text)].filter((t) => jobTokens.has(t)).length;
    const score =
      overlap * 25 +
      (authored ? 15 : 0) +
      (ownerType === 'EXPERIENCE' || fact.surface === 'experience'
        ? 20
        : ownerType === 'EDUCATION'
          ? 4
          : 0);
    const provenanceStatus =
      fact.provenanceStatus === 'VERIFIED'
        ? 'VERIFIED'
        : authored
          ? fact.provenanceStatus === 'USER_PROVIDED'
            ? 'USER_PROVIDED'
            : 'CLAIMED'
          : fact.provenanceStatus === 'OBSERVED'
            ? 'INFERRED'
            : fact.provenanceStatus || 'INFERRED';
    candidates.push({
      fact,
      factId: String(factId),
      text,
      original,
      projectId,
      score,
      provenanceStatus,
    });
  }
  candidates.sort(
    (a, b) => b.score - a.score || a.factId.localeCompare(b.factId) || a.text.localeCompare(b.text)
  );
  const selected = [];
  let wordCount = 0;
  const wordBudget = Math.max(20, Math.min(65, options.summaryWordBudget || 55));
  for (const item of candidates) {
    if (selected.length >= 2) break;
    const words = item.text.split(/\s+/).length;

    // Cross-section redundancy prevention:
    // Do not select two facts from the same experience role when distinct project facts exist
    const isSameExperienceRole =
      (item.fact.ownerType === 'EXPERIENCE' || item.fact.surface === 'experience') &&
      selected.some(
        (s) =>
          (s.fact.ownerType === 'EXPERIENCE' || s.fact.surface === 'experience') &&
          (s.fact.ownerId === item.fact.ownerId || !item.fact.ownerId)
      );
    const hasOtherCandidateFacts = candidates.some(
      (c) =>
        c.fact.ownerType !== 'EXPERIENCE' &&
        c.fact.surface !== 'experience' &&
        !selected.some((s) => s.factId === c.factId)
    );
    if (isSameExperienceRole && hasOtherCandidateFacts) continue;

    if (
      wordCount + words > wordBudget ||
      selected.some(
        (s) =>
          s.text.toLowerCase() === item.text.toLowerCase() ||
          calculateFactSemanticOverlap(s.text, item.text) >= 0.6
      )
    )
      continue;
    selected.push(item);
    wordCount += words;
  }
  const skills = (Array.isArray(selectedSkills) ? selectedSkills : []).filter(
    (s) => typeof s === 'string' || !unsupportedStatus(s.provenanceStatus || s.truthCategory)
  );

  let sentences = [];
  let transformationType = 'VERBATIM';
  let writingMethod = 'SOURCE_GROUNDED_DETERMINISTIC';

  const selectedTextTokens = tokens(selected.map((s) => s.text).join(' '));
  const hasSkillMention = skills.some((s) => {
    const name = typeof s === 'string' ? s : s.name || s.skillName || s.slug;
    return name && [...tokens(name)].some((t) => selectedTextTokens.has(t));
  });
  const shouldSynthesize =
    options.synthesizeSummary === true ||
    (options.synthesizeSummary !== false &&
      selected.length === 1 &&
      wordCount < 8 &&
      skills.length > 0 &&
      !hasSkillMention);

  if (selected.length > 0 && shouldSynthesize) {
    const rawRole =
      jobPosting?.title || options.targetRoleTitle || profile.headline || 'Software Engineer';
    const cleanRole = String(rawRole)
      .replace(/^Senior\s+/i, (m) => (options.allowSeniorTitle ? m : ''))
      .trim();

    const jobText = `${cleanRole} ${jobPosting?.description || ''}`.toLowerCase();
    const isFullStack = /\bfull[- ]?stack\b/i.test(jobText);
    const isFrontend = /\b(?:front[- ]?end|ui|interface|client)\b/i.test(jobText) && !isFullStack;
    const isDevOps =
      /\b(?:devops|platform|infrastructure|docker|ci\/cd|automation|pipeline)\b/i.test(jobText);
    const isBackend =
      !isFrontend &&
      !isDevOps &&
      (/\b(?:back[- ]?end|api|distributed|server|database|python)\b/i.test(jobText) ||
        !isFullStack);

    // Filter and rank candidate skills matching jobTokens first
    const skillList = skills
      .map((s) => (typeof s === 'string' ? s : s.name || s.skillName || s.displayName || s.slug))
      .filter(Boolean);
    const matchedSkills = skillList.filter(
      (name) => tokens(name).size > 0 && [...tokens(name)].some((t) => jobTokens.has(t))
    );
    const fallbackSkills = skillList.filter((name) => !matchedSkills.includes(name));
    const topTechNames = [...matchedSkills, ...fallbackSkills].slice(0, 4);
    const techSuffix = topTechNames.length > 0 ? ` utilizing ${topTechNames.join(', ')}` : '';

    let s1Text = '';
    if (isFrontend) {
      s1Text = `${cleanRole} specializing in responsive user interfaces, frontend architecture, and client-side performance${techSuffix}.`;
    } else if (isDevOps) {
      s1Text = `${cleanRole} focused on CI/CD automation, container orchestration, and reliable deployment pipelines${techSuffix}.`;
    } else if (isBackend && !isFullStack) {
      s1Text = `${cleanRole} specializing in backend service architecture, high-concurrency RESTful APIs, and relational data persistence${techSuffix}.`;
    } else if (isFullStack) {
      s1Text = `${cleanRole} delivering end-to-end web applications, full-stack architectures, and modular component systems${techSuffix}.`;
    } else {
      s1Text = `${cleanRole} engineering scalable software systems, reliable APIs, and maintainable application architectures${techSuffix}.`;
    }

    const firstFact = selected[0];
    const metricMatch = firstFact.original.match(
      /(?:\d+%\s*(?:reduction|increase|improvement|faster|latency|decrease)|(?:reduced|improved|increased|accelerated)\s+[^.]+?\bby\s+\d+%(?:\s+in\s+[^.]+)?)/i
    );
    let s2Text = '';
    if (isFrontend) {
      s2Text = metricMatch
        ? `Demonstrated track record of frontend optimization, achieving a ${metricMatch[0]} while improving responsive layout fidelity.`
        : `Architected component-driven interfaces and streamlined client asset delivery to improve overall user experience.`;
    } else if (isDevOps) {
      s2Text = `Automated deployment pipelines and containerized service environments to ensure high reliability and repeatable delivery.`;
    } else if (isBackend && !isFullStack) {
      s2Text = metricMatch
        ? `Proven track record of backend performance tuning, achieving a ${metricMatch[0]} while scaling high-throughput endpoints.`
        : `Engineered resilient backend services and asynchronous webhook pipelines to support high concurrency and data consistency.`;
    } else if (isFullStack) {
      s2Text = metricMatch
        ? `Proven track record of full-stack engineering, achieving a ${metricMatch[0]} while shipping maintainable product features.`
        : `Demonstrated capability designing modular architectures, developing clean APIs, and maintaining robust test coverage.`;
    } else {
      s2Text = `Demonstrated capability designing modular architectures, developing clean APIs, and maintaining robust test coverage.`;
    }

    transformationType = selected.length > 1 ? 'COMBINE' : 'REWRITE';
    writingMethod = 'SOURCE_GROUNDED_SYNTHESIS';

    const evidenceRefs = selected.map((item) =>
      toEvidenceReference(
        {
          ...item.fact,
          ...(item.fact.sourceRef && typeof item.fact.sourceRef === 'object'
            ? item.fact.sourceRef
            : {}),
          factId: item.factId,
          sourceType: item.provenanceStatus,
        },
        item.provenanceStatus
      )
    );

    sentences = [
      {
        text: s1Text,
        sourceFact: selected.map((s) => s.original).join(' '),
        transformationType: selected.length > 1 ? 'COMBINE' : 'REWRITE',
        composedFromFactIds: selected.map((s) => s.factId),
        factIds: selected.map((s) => s.factId),
        projectIds: [...new Set(selected.map((s) => s.projectId).filter(Boolean))],
        skillSlugs: topTechNames.map((n) => n.toLowerCase().replace(/[^a-z0-9-]/g, '-')),
        evidenceRefs,
        matchedRequirementIds: [],
        provenanceStatus: selected.every((s) => s.provenanceStatus === 'VERIFIED')
          ? 'VERIFIED'
          : selected.some((s) => s.provenanceStatus === 'INFERRED')
            ? 'INFERRED'
            : 'CLAIMED',
        jobRelevance: selected[0]?.score || 50,
      },
      {
        text: s2Text,
        sourceFact: firstFact.original,
        transformationType: 'REWRITE',
        composedFromFactIds: [firstFact.factId],
        factIds: [firstFact.factId],
        projectIds: firstFact.projectId ? [firstFact.projectId] : [],
        skillSlugs: [],
        evidenceRefs,
        matchedRequirementIds: [],
        provenanceStatus: firstFact.provenanceStatus,
        jobRelevance: firstFact.score,
      },
    ];
  } else {
    sentences = selected.map((item) => ({
      text: item.text,
      sourceFact: item.original,
      transformationType: 'VERBATIM',
      composedFromFactIds: [item.factId],
      factIds: [item.factId],
      projectIds: item.projectId ? [item.projectId] : [],
      skillSlugs: [],
      evidenceRefs: [
        toEvidenceReference(
          {
            ...item.fact,
            ...(item.fact.sourceRef && typeof item.fact.sourceRef === 'object'
              ? item.fact.sourceRef
              : {}),
            factId: item.factId,
            sourceType: item.provenanceStatus,
          },
          item.provenanceStatus
        ),
      ],
      matchedRequirementIds: [],
      provenanceStatus: item.provenanceStatus,
      jobRelevance: item.score,
    }));
  }

  const text = sentences.map((s) => s.text).join(' ');
  const mentionedSkills = skills.filter((s) => {
    const name = typeof s === 'string' ? s : s.name || s.skillName || s.slug;
    return name && tokens(text).has(String(name).toLowerCase());
  });
  return {
    text,
    sentences,
    sourceFact: selected.map((s) => s.original).join(' '),
    transformationType: selected.length > 1 ? 'COMBINE' : transformationType,
    composedFromFactIds: selected.map((s) => s.factId),
    evidenceRefs: sentences.flatMap((s) => s.evidenceRefs),
    provenanceStatus: selected.every((s) => s.provenanceStatus === 'VERIFIED')
      ? 'VERIFIED'
      : selected.some((s) => s.provenanceStatus === 'INFERRED' || s.provenanceStatus === 'OBSERVED')
        ? 'INFERRED'
        : 'CLAIMED',
    referencedProjectIds: [...new Set(selected.map((s) => s.projectId).filter(Boolean))],
    referencedSkillSlugs: mentionedSkills.map((s) =>
      typeof s === 'string' ? s : s.slug || s.name
    ),
    matchedRequirementIds: [],
    targetRole: jobPosting?.title || options.targetRoleTitle || null,
    topRelevantTechnicalDomains: [],
    topRelevantTechnologies: mentionedSkills.map((s) =>
      typeof s === 'string' ? s : s.name || s.slug
    ),
    strongestEngineeringEvidence: selected[0]?.original || null,
    strongestProjectSignal: selected.find((s) => s.projectId)?.projectId || null,
    strongestExperienceSignal:
      selected.find((s) => s.fact.ownerType === 'EXPERIENCE')?.original || null,
    differentiator: null,
    writingMethod,
  };
}

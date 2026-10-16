import { AppError, ValidationError } from '../errors/index.js';
import {
  buildCanonicalFactInventory,
  normalizeFactText,
} from './candidate-fact-inventory.service.js';
import {
  compressProfessionalBullet,
  normalizeWhitespace,
  sentenceCase,
  validateRephrasingSafety,
} from './resume-composition-primitives.js';
import { validateClaimEvidenceGrounding } from './resume-claim-validation.service.js';
import { buildResumeAiContext, validateAiPrivacy } from './ai-context-sanitizer.service.js';
import { sanitizeData } from '../clients/ai/prompt-policies/base-policy.js';
import { ResumeKeywordCoverageService } from './resume-keyword-coverage.service.js';
import { StudioProposalAiOutputSchema } from '../domain/career/resume-studio-proposal.schemas.js';

const refuse = (code) => {
  throw new AppError(
    'Proposal could not pass source-grounding checks. Continue editing the draft manually.',
    422,
    code
  );
};
export const studioNodeText = (content, node) =>
  node.path.reduce((value, key) => value?.[key], content);

/** Scope is a projection of the authoritative draft, using the existing fact
 * inventory/truth rules. No model, sibling bullet, target keyword or metadata flag
 * can manufacture a fact or elevate a candidate-reported claim. */
export function buildStudioProposalScope(row, payload, request) {
  const node = payload.nodes.find((item) => item.nodeId === request.nodeId);
  const parent = node && payload.nodes.find((item) => item.nodeId === node.parentId);
  if (
    !node?.editable ||
    node.kind !== 'BULLET' ||
    !['EXPERIENCE', 'PROJECT'].includes(parent?.kind)
  )
    throw new ValidationError('Select a current experience or project bullet node');
  const originalText = studioNodeText(payload.structuredResume, node);
  if (typeof originalText !== 'string' || !originalText.trim()) refuse('SOURCE_FACT_UNAVAILABLE');
  const entry = studioNodeText(payload.structuredResume, parent);
  const ownerId = parent.kind === 'PROJECT' ? entry.id : entry.id || `experience-${parent.path[1]}`;
  const identity = payload.structuredResume.candidateIdentity;
  const profile = {
    id: row.candidateId,
    tenantId: row.tenantId,
    userId: row.userId,
    displayName: identity.displayName,
    email: identity.email,
    phone: identity.phone,
    location: identity.location,
    links: identity.links,
    skills: [],
    projects: [],
    experience: [],
  };
  if (parent.kind === 'PROJECT')
    profile.projects = [
      { id: ownerId, name: entry.name, bullets: [originalText], technologies: [] },
    ];
  else profile.experience = [{ id: ownerId, company: entry.company, bullets: [originalText] }];
  const inventory = buildCanonicalFactInventory(profile);
  const facts = inventory.facts.filter(
    (fact) =>
      fact.ownerId === ownerId &&
      fact.candidateAuthored === true &&
      fact.provenanceStatus === 'CLAIMED' &&
      fact.text === normalizeFactText(originalText)
  );
  if (facts.length !== 1 || payload.nodeProvenance[node.nodeId]?.truthState !== 'CLAIMED')
    refuse('SOURCE_FACT_UNAVAILABLE');
  const finish = (text) => (/[.!?]$/.test(text) ? text : text + '.');
  const actionAlternates = [
    [/^Implemented\b/i, 'Engineered'],
    [/^Engineered\b/i, 'Implemented'],
    [/^Developed\b/i, 'Engineered'],
    [/^Architected\b/i, 'Designed'],
    [/^Designed\b/i, 'Architected'],
    [/^Built\b/i, 'Engineered'],
    [/^Maintained\b/i, 'Operated'],
    [/^Operated\b/i, 'Maintained'],
    [/^Documented\b/i, 'Cataloged'],
    [/^Cataloged\b/i, 'Documented'],
    [/^Reviewed\b/i, 'Audited'],
    [/^Audited\b/i, 'Reviewed'],
    [/^Optimized\b/i, 'Streamlined'],
    [/^Streamlined\b/i, 'Optimized'],
    [/^Configured\b/i, 'Provisioned'],
    [/^Provisioned\b/i, 'Configured'],
    [/^Created\b/i, 'Engineered'],
    [/^Automated\b/i, 'Streamlined'],
    [/^Led\b/i, 'Directed'],
    [/^Directed\b/i, 'Led'],
    [/^Authored\b/i, 'Produced'],
    [/^Produced\b/i, 'Authored'],
    [/^Analyzed\b/i, 'Evaluated'],
    [/^Evaluated\b/i, 'Analyzed'],
    [/^Resolved\b/i, 'Remediated'],
    [/^Remediated\b/i, 'Resolved'],
  ];
  const rephrased = [];
  if (originalText.split(/\s+/).filter(Boolean).length > 3) {
    for (const [pattern, replacement] of actionAlternates) {
      if (pattern.test(originalText)) {
        rephrased.push(finish(sentenceCase(originalText.replace(pattern, replacement))));
      }
    }
  }
  const variants = [
    ...new Set([
      finish(sentenceCase(normalizeWhitespace(originalText))),
      finish(sentenceCase(compressProfessionalBullet(originalText))),
      ...rephrased,
    ]),
  ].filter((text) => text !== originalText);
  if (!variants.length) refuse('NO_WORDING_CHANGE');
  const requirements = payload.jobDescription.requirements;
  const cover = (requirement) => {
    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: { requirements: [requirement] },
      structuredResume: { experience: [{ bullets: [originalText] }] },
    });
    return report.termBreakdown.some(
      (term) =>
        ['EXACT', 'TAXONOMY_EQUIVALENT'].includes(term.matchType) && term.satisfiesRequirement
    );
  };
  const requirement = request.requirementId
    ? requirements.find((item) => item.id === request.requirementId)
    : requirements.find(cover) || requirements[0] || null;
  if (request.requirementId && !requirement)
    throw new ValidationError('Unknown target job requirement');
  const jobRequirement = requirement
    ? {
        id: requirement.id,
        text:
          requirement.extractedValue ||
          requirement.originalText ||
          requirement.rawSnippet ||
          requirement.text ||
          '',
        category: requirement.category,
        importance: requirement.importance,
        sourceCovered: cover(requirement),
      }
    : null;
  const safe = buildResumeAiContext({
    candidateProfile: profile,
    factInventory: facts,
    taskType: 'RESUME_WORDING',
    job: {
      title: payload.jobTarget.title || payload.jobDescription.title,
      description: payload.jobTarget.rawDescription,
      requirements: requirement ? [jobRequirement.text] : [],
    },
  });
  const modelContext = sanitizeData({
    facts: safe.context.facts,
    variants,
    truthState: 'CLAIMED',
    target: safe.context.targetJob,
  });
  if (
    !validateAiPrivacy({ text: originalText, candidateProfile: profile }).valid ||
    !validateAiPrivacy({ text: JSON.stringify(modelContext), candidateProfile: profile }).valid ||
    JSON.stringify(modelContext.variants) !== JSON.stringify(variants)
  )
    refuse('SOURCE_PRIVACY_UNSAFE');
  return {
    node,
    originalText,
    ownerId,
    profile,
    facts,
    variants,
    modelContext,
    safe,
    jobRequirement,
    sectionOwnerType: parent.kind,
    protectedLiterals: [
      entry.company,
      entry.title,
      entry.name,
      entry.startDate,
      entry.endDate,
      ...(originalText.match(/"[^"\n]+"|“[^”\n]+”|`[^`\n]+`/gu) || []),
    ].filter(Boolean),
    sourceKind: payload.nodeProvenance[node.nodeId].editedAtRevision
      ? 'DRAFT_EDIT'
      : 'MASTER_SNAPSHOT',
  };
}

export function admitStudioRewrite(scope, output) {
  const parsed = StudioProposalAiOutputSchema.safeParse(output);
  if (!parsed.success) refuse('UNSUPPORTED_REWRITE');
  const value = parsed.data;
  if (
    scope.protectedLiterals.some(
      (literal) => scope.originalText.includes(literal) && !value.proposedText.includes(literal)
    )
  )
    refuse('UNSUPPORTED_REWRITE');
  const ids = scope.safe.resolveFactIds(value.factIds);
  if (
    ids.length !== 1 ||
    ids[0] !== scope.facts[0].factId ||
    !scope.variants.includes(value.proposedText)
  )
    refuse('UNSUPPORTED_REWRITE');
  try {
    validateRephrasingSafety(scope.originalText, value.proposedText, scope.profile);
  } catch {
    refuse('UNSUPPORTED_REWRITE');
  }
  const integrity = validateClaimEvidenceGrounding(
    {
      text: value.proposedText,
      factIds: ids,
      sourceFact: scope.originalText,
      transformationType: 'CONDENSE',
    },
    {
      factInventory: scope.facts,
      candidateProfile: scope.profile,
      sectionOwnerType: scope.sectionOwnerType,
      sectionOwnerId: scope.ownerId,
    }
  );
  if (!integrity.valid) refuse('UNSUPPORTED_REWRITE');
  return value.proposedText;
}

import { getPromptPolicy } from '../clients/ai/prompt-policies/index.js';
import { buildResumeAiContext } from './ai-context-sanitizer.service.js';
import { validateClaimEvidenceGrounding } from './resume-claim-validation.service.js';
import { toEvidenceReference } from './resume-composition-primitives.js';

// Writing may change; material qualifications must remain in the cited source.
// Canonicalize common grammatical inflections and conservative writing equivalents.
const equivalent = new Map([
  ['built', 'implement'],
  ['developed', 'implement'],
  ['implemented', 'implement'],
  ['created', 'create'],
  ['wrote', 'write'],
  ['authored', 'write'],
  ['using', 'use'],
  ['uses', 'use'],
  ['utilized', 'use'],
  ['designed', 'design'],
  ['tested', 'test'],
  ['testing', 'test'],
  ['tests', 'test'],
  ['added', 'add'],
  ['integrated', 'integrate'],
  ['integration', 'integrate'],
  ['maintained', 'maintain'],
  ['documented', 'document'],
  ['endpoints', 'endpoint'],
  ['interfaces', 'interface'],
  ['databases', 'database'],
  ['migrations', 'migration'],
  ['applications', 'application'],
  ['apis', 'api'],
  ['validation', 'validate'],
  ['validated', 'validate'],
  ['validating', 'validate'],
]);
const grammar = new Set(
  'a an the and or with for in on of to from by as through across while that which is are was were has have includes include including use'.split(
    ' '
  )
);
const words = (value) =>
  String(value || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}+#]+(?:\.[\p{L}\p{N}]+)*/gu) || [];
const canonical = (word) => equivalent.get(word) || word;

/** Adds source vocabulary/negation checks to the existing ownership, privacy,
 * technology, metric, employment, agency and outcome validator. Fact IDs alone
 * never confer authority to invent a different sentence. */
export function validateProviderResumeClaim(claim, context) {
  const result = validateClaimEvidenceGrounding(claim, context);
  const ids = new Set(claim.composedFromFactIds || []);
  const facts = context.factInventory.filter((f) => ids.has(f.factId || f.id));
  const source = facts.map((f) => f.text).join(' ');
  const allowed = new Set(words(source).map(canonical));
  const novel = words(claim.text)
    .map(canonical)
    .filter((word) => !grammar.has(word) && !allowed.has(word));
  if (novel.length)
    result.violations.push({
      code: 'UNSUPPORTED_MATERIAL_WORDING',
      message: 'Proposed wording introduces material information outside its cited facts.',
    });
  if (
    /\b(no|not|never|without|lacks?|missing)\b/i.test(source) !==
    /\b(no|not|never|without|lacks?|missing)\b/i.test(claim.text)
  )
    result.violations.push({
      code: 'SOURCE_NEGATION_CHANGED',
      message: 'Proposed wording changes a source qualification or negation.',
    });
  if (
    facts.some(
      (f) =>
        f.renderable === false ||
        ['MISSING', 'MISSING_EVIDENCE', 'UNKNOWN', 'INFERRED'].includes(
          f.truthCategory || f.provenanceStatus
        ) ||
        (f.tenantId &&
          context.candidateProfile.tenantId &&
          f.tenantId !== context.candidateProfile.tenantId)
    )
  )
    result.violations.push({
      code: 'UNAUTHORIZED_SOURCE_FACT',
      message: 'Source fact is not authorized for candidate writing.',
    });
  return { valid: result.violations.length === 0, violations: result.violations };
}

/** Uses the selected provider only. No implicit transfer to another provider. */
export async function realizeResumeWriting({
  provider,
  taskType,
  candidateProfile,
  job,
  selectedProjects = [],
  selectedSkills = [],
  facts = [],
  timeoutMs = 30000,
  sectionOwnerType = 'PROJECT',
}) {
  const candidateId = candidateProfile.id || candidateProfile.candidate?.id;
  const projectIds = new Set(
    selectedProjects.flatMap((p) => [p.id, p.projectId, p.name, p.displayName]).filter(Boolean)
  );
  facts = facts.filter((f) => {
    if (!f) return false;
    const owner =
      f.association?.projectId ||
      (String(f.ownerType).toUpperCase() === 'PROJECT' ? f.ownerId || f.sectionOwnerId : null);
    return (
      f &&
      f.renderable !== false &&
      (f.candidateAuthored === true || f.agencyLevel === 'CANDIDATE') &&
      (!f.candidateId || f.candidateId === candidateId) &&
      (!f.tenantId || f.tenantId === candidateProfile.tenantId) &&
      (!owner || projectIds.has(owner)) &&
      ![f.truthCategory, f.provenanceStatus, f.status].some((value) =>
        ['MISSING', 'MISSING_EVIDENCE', 'UNKNOWN', 'INFERRED'].includes(value)
      )
    );
  });
  if (!provider?.generateStructured || !facts.length) return { status: 'UNAVAILABLE', claims: [] };
  const policy = getPromptPolicy(taskType);
  const envelope = buildResumeAiContext({
    job,
    candidateProfile,
    selectedProjects,
    selectedSkills,
    factInventory: facts,
    taskType,
  });
  let timer;
  try {
    const response = await Promise.race([
      provider.generateStructured({
        taskType,
        prompt:
          'Write concise, job-specific professional prose from the supplied facts. Paraphrase and combine supported contributions; never add a qualification, metric, technology, employer, seniority or outcome. Return the required JSON and cite the supplied transient fact IDs.',
        candidateFacts: envelope.context,
        jobRequirements: envelope.context.targetJob,
        responseSchema: policy.responseSchema,
        timeoutMs,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Writing timeout');
          error.code = 'WRITING_TIMEOUT';
          reject(error);
        }, timeoutMs);
      }),
    ]);
    const parsed = policy.responseSchema.safeParse(response?.data);
    if (!parsed.success) return { status: 'REJECTED', reason: 'MALFORMED_OUTPUT', claims: [] };
    const proposed =
      taskType === 'RESUME_SUMMARY_SYNTHESIS'
        ? [
            {
              text: parsed.data.summaryText,
              factIds: parsed.data.composedFromFactIds,
              transformationType: 'REWRITE',
            },
          ]
        : parsed.data.bullets;
    const claims = [];
    for (const item of proposed) {
      if (
        item.unsupportedClaims?.length ||
        item.factIds.some((id) => !envelope.transientToCanonicalFactId.has(id))
      )
        return { status: 'REJECTED', reason: 'UNKNOWN_OR_UNSUPPORTED_FACT', claims: [] };
      const factIds = [...new Set(envelope.resolveFactIds(item.factIds))];
      const contributing = facts.filter((f) => factIds.includes(f.factId || f.id));
      const claim = {
        text: item.text,
        composedFromFactIds: factIds,
        sourceFact: contributing.map((f) => f.text),
        transformationType: item.transformationType || 'REWRITE',
        provenanceStatus: 'CLAIMED',
        evidenceRefs: contributing.map((f) =>
          toEvidenceReference({ ...f, sourceType: 'CLAIMED' }, 'CLAIMED')
        ),
        matchedRequirementIds: [],
      };
      if (taskType === 'RESUME_SUMMARY_SYNTHESIS' && claim.text.split(/\s+/).length > 65)
        return { status: 'REJECTED', reason: 'SUMMARY_WORD_BUDGET', claims: [] };
      const validation = validateProviderResumeClaim(claim, {
        candidateProfile,
        factInventory: facts,
        sectionOwnerType: taskType === 'RESUME_SUMMARY_SYNTHESIS' ? 'SUMMARY' : sectionOwnerType,
        sectionOwnerId: selectedProjects[0]?.id,
        project: selectedProjects[0],
        alreadyRenderedClaims: claims,
      });
      if (!validation.valid)
        return {
          status: 'REJECTED',
          reason: validation.violations[0]?.code || 'FACTUAL_VALIDATION',
          claims: [],
        };
      claims.push(claim);
    }
    return {
      status: 'ACCEPTED',
      claims,
      provider: String(response.provider || provider.id || 'configured'),
      modelId: response.modelId || undefined,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      reason: error.code === 'WRITING_TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_FAILURE',
      claims: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

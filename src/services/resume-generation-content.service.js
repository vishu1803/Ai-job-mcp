import { buildStructuredResumeSnapshot } from './structured-resume.service.js';
import { fitOnePageResume } from './one-page-resume.service.js';
import { defaultAiResumeContentGenerator } from './ai-resume-content-generator.service.js';
import {
  StructuredResumeDocumentSchema,
  ResumeTailoringPlanSchema,
  EvidenceValidationReceiptSchema,
} from '../domain/career/resume.schemas.js';
import { ValidationError } from '../errors/index.js';

/** Shared composition boundary for authorized generation and regeneration.
 * Ownership, immutable source loading and persistence remain the caller's responsibility.
 * Reuses the existing writer, structured builder, evidence gate and physical fitter.
 * This is not a second tailoring policy or a publicly callable authorization boundary.
 */
export async function generateResumeContent({
  candidateProfile,
  jobPosting,
  selectedProjects = [],
  selectedSkills = [],
  projectRankings = [],
  matchAnalysis,
  factInventory = [],
  aiProvider,
  generator,
  compiler,
  logger,
}) {
  let aiContent = null;
  try {
    aiContent = await defaultAiResumeContentGenerator.generateResumeAiContent({
      candidateProfile,
      targetJobPosting: jobPosting,
      selectedProjects,
      selectedSkills,
      factInventory,
      aiProvider,
    });
  } catch {
    // Provider failures never authorize unvalidated wording or degraded source facts.
    // Do not log provider exception text, which may contain candidate content.
    logger?.warn('Resume composition unavailable; using source-grounded deterministic fallback');
  }

  const snapshot = buildStructuredResumeSnapshot({
    candidateProfile,
    jobPosting,
    options: { projectRankings, matchAnalysis, aiContent, maxProjects: 3 },
  });
  StructuredResumeDocumentSchema.parse(snapshot.structuredResume);
  ResumeTailoringPlanSchema.parse(snapshot.tailoringPlan);
  EvidenceValidationReceiptSchema.parse(snapshot.evidenceValidationReceipt);
  if (snapshot.evidenceValidationReceipt.overallStatus !== 'PASS') {
    const violations = (snapshot.evidenceValidationReceipt.violations || [])
      .map((v) => `${v.section || 'DOCUMENT'}: ${v.message || v.violationType}`)
      .join('; ');
    throw new ValidationError(
      `Structured resume document failed evidence integrity validation: ${violations || 'receipt status is not PASS'}`,
      'STRUCTURED_RESUME_INTEGRITY_FAILED'
    );
  }
  const safeStructuredResume = await fitOnePageResume(
    JSON.parse(JSON.stringify(snapshot.structuredResume)),
    jobPosting,
    { generator, compiler }
  );
  return {
    safeStructuredResume,
    safeTailoringPlan: JSON.parse(JSON.stringify(snapshot.tailoringPlan)),
    safeEvidenceReceipt: JSON.parse(JSON.stringify(snapshot.evidenceValidationReceipt)),
  };
}

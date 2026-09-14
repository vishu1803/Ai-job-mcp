/**
 * @file Resume Professional Summary Synthesis Prompt Policy
 *
 * Directs AI language realization for job-conditioned professional summaries:
 * - Structured prompt envelope with authorized candidate facts, verified skills, and selected projects.
 * - Enforces evidence grounding, natural professional variation, and zero fabrication.
 * - Explicitly prohibits repetitive templates, empty corporate buzzwords, and ungrounded claims.
 * - Returns structured JSON conforming to ResumeSummaryResponseSchema.
 */

import { z } from 'zod';
import { BasePromptPolicy } from './base-policy.js';

/**
 * Zod response schema contract for AI professional summary synthesis.
 */
export const ResumeSummaryResponseSchema = z.object({
  summaryText: z.string().trim().min(30).max(1000),
  referencedSkillSlugs: z.array(z.string().trim()).default([]),
  referencedProjectIds: z.array(z.string().trim()).default([]),
  composedFromFactIds: z.array(z.string().trim()).default([]),
  emphasizedThemes: z.array(z.string().trim()).default([]),
  writingRationale: z.string().trim().default(''),
  confidence: z.number().min(0).max(1).default(1.0),
});

export class ResumeSummaryPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'RESUME_SUMMARY_SYNTHESIS',
      policyVersion: '1.0.0',
      taskDescription:
        'Synthesize a natural, job-conditioned professional summary (2-3 sentences) strictly grounded in verified candidate facts and capabilities, tailored to the target role without boilerplate templates.',
      contextLimits: {
        maxCandidateFacts: 35,
        maxEvidenceItems: 25,
        maxJobRequirements: 30,
        maxJobTextLength: 8000,
      },
    });
  }

  getTaskSpecificConstraints() {
    return `=== RESUME PROFESSIONAL SUMMARY CONSTRAINTS ===
1. PRIMARY WRITING OBJECTIVE:
   Synthesize a 2 to 3 sentence professional career summary that:
   - Specifically conditions the candidate's verified profile to the target job description and engineering expectations.
   - Highlights the intersection of the candidate's authentic technical skills, architectural accomplishments, and project deliverables with the job's core technical requirements.
   - Produces natural, fluent, and highly specific prose that varies meaningfully between different engineering roles (e.g. Backend vs Frontend vs Full-Stack vs DevOps).
   - AVOID reusing identical sentence templates or robotic fill-in-the-blank formulas across different jobs.

2. STRICT FACTUAL GROUNDING (ZERO FABRICATION):
   - Every technical skill, framework, and project mentioned MUST exist in <candidate_facts> and <verified_skills>.
   - Map every referenced fact or accomplishment directly into composedFromFactIds[].
   - Map referenced skill slugs to referencedSkillSlugs[].
   - Map referenced project IDs to referencedProjectIds[].
   - NEVER invent years of experience, titles, employers, certifications, metrics, or technologies not present in the candidate evidence.

3. PROHIBITED PHRASING & TEMPLATE BOILERPLATE:
   - NEVER use hollow filler: "results-driven professional", "dynamic self-starter", "passionate developer looking for opportunities", "proven track record of success".
   - NEVER use mechanical sentence templates like: "Software Engineer specializing in X and Y with verified competencies in A, B, C. Demonstrated delivery of scalable software solutions proven through project Z."
   - Write like an experienced technical writer introducing an engineer based strictly on what they have built.

4. SENIORITY & CANDIDATE ARCHETYPE:
   - If the candidate is an entry-level or fresher engineer, do NOT describe them as "Senior", "Principal", "Lead", or "Industry Veteran". Describe their technical strengths accurately and objectively.`;
  }
}

export default ResumeSummaryPolicy;

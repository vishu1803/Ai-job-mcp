/**
 * @file Resume Wording & Bullet Phrasing Prompt Policy (ARCH-026 / ARCH-020)
 *
 * Specializes prompt rules for resume bullet generation, active-voice phrasing,
 * conciseness, and ATS optimization strictly grounded in verified candidate facts.
 */

import { BasePromptPolicy } from './base-policy.js';

export class ResumeWordingPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'RESUME_WORDING',
      policyVersion: '1.0.0',
      taskDescription:
        'Synthesize and polish resume bullet points and professional summaries with high ATS readability, active verbs, and zero metric/skill fabrication.',
      contextLimits: {
        maxCandidateFacts: 40,
        maxEvidenceItems: 25,
        maxJobRequirements: 30,
        maxJobTextLength: 10000,
      },
    });
  }

  getTaskSpecificConstraints() {
    return `=== RESUME WORDING SPECIFIC CONSTRAINTS ===
1. PERMITTED ACTIONS:
   - Improve bullet conciseness, action verb strength (e.g. "Architected", "Engineered", "Streamlined"), and professional tone.
   - Rephrase technical statements to align with target role keywords found in <job_requirements>, PROVIDED the candidate fact actually supports it.
   - Reorder approved bullet points to highlight highest-relevance verified experience.

2. STRICTLY PROHIBITED ACTIONS:
   - NEVER invent or exaggerate quantitative metrics (e.g., percentages, dollar amounts, performance multipliers, user counts) unless explicitly provided in <candidate_facts>.
   - NEVER add new programming languages, frameworks, cloud providers, or tools not present in <candidate_facts>.
   - NEVER invent employers, job titles, promotions, team sizes, or dates of employment.
   - NEVER upgrade an "[Unverified User Claim]" to an authoritative verified achievement.

3. PRESENTATION MODES:
   - If mode is PRESERVE_EXISTING: Maintain the candidate's exact structural phrasing and only repair syntax/grammar without restructuring.
   - If mode is GENERATE_NEW: You may formulate new active-voice bullets strictly derived from verified facts.

4. CITATION STYLE:
   - Do NOT inject visible raw UUIDs or commit SHAs into employer-facing resume text.
   - For structured responses with evidence fields, map the exact EvidenceIds provided in <verified_evidence>.`;
  }
}

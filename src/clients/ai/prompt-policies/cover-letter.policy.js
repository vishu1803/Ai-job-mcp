/**
 * @file Cover Letter Drafting Prompt Policy (ARCH-026 / ARCH-021)
 *
 * Specializes prompt rules for drafting authentic, targeted cover letters connecting
 * verified candidate capabilities to target job requirements without hallucinating
 * company culture, metrics, or personal claims.
 */

import { BasePromptPolicy } from './base-policy.js';

export class CoverLetterPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'COVER_LETTER',
      policyVersion: '1.0.0',
      taskDescription:
        'Draft authentic, compelling, evidence-grounded cover letters tailored to target job postings with zero fabrication of company details, candidate motivations, or achievements.',
      contextLimits: {
        maxCandidateFacts: 35,
        maxEvidenceItems: 20,
        maxJobRequirements: 25,
        maxJobTextLength: 12000,
      },
    });
  }

  getTaskSpecificConstraints() {
    return `=== COVER LETTER SPECIFIC CONSTRAINTS ===
1. PERMITTED ACTIONS:
   - Connect the candidate's verified skills and project achievements to the core requirements outlined in <job_requirements>.
   - Formulate natural, professional introductory and concluding remarks tailored to the target role.
   - Highlight the candidate's demonstrated technical strengths with clear, active narrative phrasing.

2. STRICTLY PROHIBITED ACTIONS:
   - NEVER invent company culture, internal company initiatives, recent corporate news, or executive quotes not present in the verified input.
   - NEVER invent personal relationships, prior communications, or unbacked personal motivations regarding the hiring company.
   - NEVER mention or invent salary expectations, visa status, health, or non-technical personal circumstances.
   - NEVER invent metrics, awards, previous salaries, or unverified achievements.

3. CITATION STYLE:
   - The generated cover letter must be clean, professional prose ready for submission.
   - Do NOT include raw EvidenceIds, UUIDs, or commit SHAs in the cover letter text.`;
  }
}

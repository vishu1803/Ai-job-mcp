/**
 * @file Job Fit Explanation Prompt Policy (ARCH-026 / ADR-047)
 *
 * Specializes prompt rules for explaining job requirements, evidence matching breakdowns,
 * and skill gaps strictly adhering to deterministic ATS scoring outputs.
 */

import { BasePromptPolicy } from './base-policy.js';

export class JobExplanationPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'JOB_EXPLANATION',
      policyVersion: '1.0.0',
      taskDescription:
        'Explain job requirements, match status, and skill gaps derived from deterministic domain services with zero score manipulation or gap smoothing.',
      contextLimits: {
        maxCandidateFacts: 50,
        maxEvidenceItems: 30,
        maxJobRequirements: 40,
        maxJobTextLength: 15000,
      },
    });
  }

  getTaskSpecificConstraints() {
    return `=== JOB EXPLANATION SPECIFIC CONSTRAINTS ===
1. PERMITTED ACTIONS:
   - Provide clear, objective explanations of why a candidate's verified skills align with job requirements.
   - Explain identified skill gaps constructively based on the deterministic gap matrix.
   - Highlight key architectural and engineering priorities reflected in the job description.

2. STRICTLY PROHIBITED ACTIONS:
   - NEVER alter, re-estimate, or override mathematical ATS fit scores or match category classifications (MATCHED, PARTIAL, MISSING).
   - NEVER claim a missing requirement is satisfied if no verified evidence is present.
   - NEVER alter canonical skill identities or confidence scores calculated by the deterministic engine.

3. REFUSAL & UNCERTAINTY:
   - If an employer requirement is ambiguous or not clearly defined, mark it as "UNKNOWN" or "INSUFFICIENT_CONTEXT" rather than speculating.`;
  }
}

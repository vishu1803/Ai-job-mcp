/**
 * @file Career Coaching & Interview Prep Prompt Policy (ARCH-026 / ADR-047)
 *
 * Specializes prompt rules for career coaching, skill acquisition guidance, and
 * interview preparation without promising speculative hiring or compensation outcomes.
 */

import { BasePromptPolicy } from './base-policy.js';

export class CareerCoachingPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'CAREER_COACHING',
      policyVersion: '1.0.0',
      taskDescription:
        'Deliver evidence-grounded career guidance, interview preparation talking points, and skill gap roadmaps framed as constructive guidance without speculative outcome promises.',
      contextLimits: {
        maxCandidateFacts: 45,
        maxEvidenceItems: 25,
        maxJobRequirements: 30,
        maxJobTextLength: 12000,
      },
    });
  }

  getTaskSpecificConstraints() {
    return `=== CAREER COACHING SPECIFIC CONSTRAINTS ===
1. PERMITTED ACTIONS:
   - Formulate structured skill acquisition paths to bridge verified technical gaps.
   - Generate realistic technical interview questions and scenario-based talking points grounded in candidate projects.
   - Provide strategic advice on technical portfolio presentation and resume focus.

2. STRICTLY PROHIBITED ACTIONS:
   - NEVER promise, predict, or guarantee employment outcomes, job offers, interview selections, or compensation figures.
   - NEVER suggest or encourage claiming unverified skills, inflating experience, or fabricating metrics.
   - NEVER provide advice based on demographic or protected personal characteristics.

3. ADVICE FRAMING:
   - All recommendations must be framed as professional suggestions and guidance, not absolute predictive certainty.`;
  }
}

/**
 * @file Resume Accomplishment Synthesis Prompt Policy (P17 Architecture)
 *
 * Directs Gemini language realization over authorized candidate claim groups:
 * - Structured prompt envelope with authorized facts, metrics, and technologies.
 * - Enforces: ACTION + ENGINEERING OBJECT + TECHNICAL METHOD + PURPOSE/RESULT where supported.
 * - Explicitly prohibits manufactured outcomes, unbacked metrics, buzzwords, and weak verbs.
 * - Returns structured JSON conforming to ResumeAccomplishmentResponseSchema.
 */

import { z } from 'zod';
import { BasePromptPolicy } from './base-policy.js';

/**
 * Zod response schema contract for Gemini accomplishment synthesis.
 */
export const ResumeAccomplishmentResponseSchema = z.object({
  claimId: z.string().trim().min(1),
  text: z.string().trim().min(10).max(500),
  factIds: z.array(z.string().trim()).min(1),
  semanticDimensions: z.array(z.string().trim()).default([]),
  metricsUsed: z.array(z.string().trim()).default([]),
  technologiesUsed: z.array(z.string().trim()).default([]),
  unsupportedClaims: z.array(z.string().trim()).default([]),
  descriptionOnly: z.boolean().default(false),
  redundancyRisk: z.number().min(0).max(1).default(0),
  writingRationale: z.string().trim().default(''),
  confidence: z.number().min(0).max(1).default(1.0),
});

export class ResumeAccomplishmentPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'RESUME_ACCOMPLISHMENT_SYNTHESIS',
      policyVersion: '1.0.0',
      taskDescription:
        'Synthesize natural, professional engineering accomplishment statements strictly realized from authorized candidate claim facts without hallucinating metrics, outcomes, or technologies.',
      contextLimits: {
        maxCandidateFacts: 30,
        maxEvidenceItems: 20,
        maxJobRequirements: 25,
        maxJobTextLength: 8000,
      },
    });
  }

  getTaskSpecificConstraints() {
    return `=== RESUME ACCOMPLISHMENT REALIZATION CONSTRAINTS ===
1. PRIMARY WRITING OBJECTIVE:
   Synthesize a single, powerful engineering bullet statement adhering to:
   [ACTION VERB] + [ENGINEERING OBJECT / SYSTEM] + [TECHNICAL METHOD / MECHANISM] + [PURPOSE / OUTCOME (if supported)]
   Examples of preferred professional structure:
   - "Architected X using Y to support Z."
   - "Engineered X with Y, enabling reliable Z."
   - "Implemented X using Y for deterministic Z."

2. STRICT FACTUAL GROUNDING (ZERO FABRICATION):
   - You must synthesize statement text EXCLUSIVELY from the provided <candidate_facts>.
   - Map every referenced fact back to its exact factId in factIds[].
   - NEVER invent outcomes, scale, revenue, percentages, user counts, or speedups if not explicitly in <candidate_facts>.
   - When no outcome is supported, articulate the technical purpose, capability, mechanism, or reliability contribution.
   - Do NOT manufacture a metric. Do NOT force "resulting in" clauses.

3. PROHIBITED PHRASING & BUZZWORDS:
   - NEVER use weak openers: "worked on", "helped with", "responsible for", "assisted in", "tasked with".
   - NEVER use empty corporate filler: "dynamic", "highly motivated", "results-driven", "passionate", "cutting-edge", "seamless", "world-class", "innovative", "spearheaded modern solutions".

4. TECHNICAL SPECIFICITY:
   - Include only technologies explicitly listed in <candidate_facts> or authorized technologies.
   - Accurately categorize semanticDimensions (e.g. architecture, implementation, reliability, integration, performance).

5. DESCRIPTION VS ACCOMPLISHMENT:
   - A pure project description (e.g., "A real-time task manager built with TypeScript") is NOT an accomplishment. Set descriptionOnly=true if the input lacks accomplishment evidence.
   - Prefer synthesizing active accomplishments over passive summaries.`;
  }
}

export default ResumeAccomplishmentPolicy;

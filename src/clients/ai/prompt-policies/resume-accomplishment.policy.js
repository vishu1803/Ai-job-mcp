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
export const ResumeAccomplishmentBulletSchema = z.object({
  claimId: z.string().trim().default(''),
  text: z.string().trim().min(10).max(500),
  factIds: z.array(z.string().trim()).min(1),
  transformationType: z
    .enum(['REWRITE', 'CONDENSE', 'COMBINE', 'EMPHASIZE', 'VERBATIM'])
    .default('REWRITE'),
  semanticDimensions: z.array(z.string().trim()).default([]),
  metricsUsed: z.array(z.string().trim()).default([]),
  technologiesUsed: z.array(z.string().trim()).default([]),
  unsupportedClaims: z.array(z.string().trim()).default([]),
  writingRationale: z.string().trim().default(''),
});

/**
 * Zod response schema contract for Gemini accomplishment synthesis (bullets array).
 */
export const ResumeAccomplishmentResponseSchema = z.object({
  bullets: z.array(ResumeAccomplishmentBulletSchema).min(3),
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
    this.responseSchema = ResumeAccomplishmentResponseSchema;
  }

  getTaskSpecificConstraints() {
    return `=== RESUME ACCOMPLISHMENT REALIZATION CONSTRAINTS ===
1. PRIMARY WRITING OBJECTIVE & PRIVACY BOUNDARY:
   Synthesize at least 3 concise, powerful engineering accomplishment bullets for the project, returned in { bullets: [...] }.
   Every single bullet MUST be a complete sentence ending with a period (.), adhering strictly to:
   [ACTION VERB] + [ENGINEERING OBJECT / SYSTEM] + [TECHNICAL METHOD / MECHANISM] + [PURPOSE / OUTCOME (if supported)]
   - NEVER mention candidate personal name, contact information, or personal identifiers.
   Examples of preferred professional structure:
   - "Architected high-concurrency microservices using Node.js and PostgreSQL to support real-time data synchronization."
   - "Engineered asynchronous webhook pipelines with FastAPI to process external event payloads reliably."
   - "Implemented JWT-based authentication and role-based access control (RBAC) to ensure secure multi-tenant isolation."

2. THREE DIVERSE TECHNICAL ASPECTS:
   Across the 3 synthesized bullets, you must cover 3 distinct, complementary aspects of the project:
   - Aspect 1: Core application architecture, platform design, or full-stack delivery.
   - Aspect 2: Backend APIs, data persistence, database optimization, or schema modeling.
   - Aspect 3: Integration, performance, asynchronous workflows, automation, or security.
   Do not repeat the same focus or technologies identically across multiple bullets.

3. STRICT FACTUAL GROUNDING & ZERO OUTCOME EXTRAPOLATION:
   - You must synthesize statement text EXCLUSIVELY from the provided <candidate_facts>.
   - Map every referenced fact back to its exact factId in factIds[].
   - OUTCOME GROUNDING CONTRACT: A project bullet may claim an outcome ONLY when a candidate-owned source fact explicitly supports it, or the transformation is a faithful semantic rewrite of that fact.
   - Do NOT infer percentage reductions, time savings, productivity improvements, developer velocity, code quality improvements, scale, or business outcomes from merely knowing that automation exists.
     (e.g., knowing that "automated code evaluation" exists does NOT authorize claiming "reduced manual review time" or "improved developer velocity" unless explicitly stated in the source fact).
   - When no metric or outcome is supported, articulate the technical purpose, mechanism, or reliability contribution.
   - NEVER claim cloud infrastructure or technologies (e.g. AWS, Kubernetes) unless explicitly listed in <candidate_facts>.

4. PROHIBITED PHRASING, FRAGMENTS & BUZZWORDS:
   - NEVER output sentence fragments or raw repository descriptions (e.g. "Intelligent automated code review system...", "Real-time collaborative task manager built with...").
   - NEVER use weak openers: "worked on", "helped with", "responsible for", "assisted in", "tasked with".
   - NEVER use empty corporate filler: "dynamic", "highly motivated", "results-driven", "passionate", "cutting-edge", "seamless", "world-class", "innovative".

5. ACTIVE VOICE & COMPLETE SENTENCES:
   - Every bullet must begin with a strong past-tense engineering action verb (Engineered, Architected, Designed, Implemented, Built, Deployed, Optimized, Scaled, Automated, Configured, Integrated).
   - Every bullet must terminate with punctuation (.).`;
  }
}

export default ResumeAccomplishmentPolicy;

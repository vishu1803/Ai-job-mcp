/**
 * @file Resume Entity Resolution AI Prompt Policy (ARCH-026 / ADR-047).
 *
 * Implements structured prompt policy for multi-mention entity resolution,
 * semantic disambiguation, and relationship extraction on parsed resume mentions.
 */

import {
  BasePromptPolicy,
  UNIVERSAL_ZERO_HALLUCINATION_POLICY,
  sanitizeData,
} from './base-policy.js';

export class ResumeEntityResolutionPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'RESUME_ENTITY_RESOLUTION',
      policyVersion: '1.0.0',
      taskDescription:
        'Disambiguate extracted resume mentions, group aliases into canonical entities, classify contextual scopes, and extract entity relationships without fabricating unmentioned facts.',
    });
  }

  /**
   * Builds the system prompt for resume entity resolution.
   *
   * @returns {string} System instruction prompt
   */
  buildSystemPrompt() {
    return `${UNIVERSAL_ZERO_HALLUCINATION_POLICY}

You are an expert technical resume entity resolver and knowledge graph builder.
Your task is to analyze candidate entity groups extracted from a resume and determine:
1. Which textual mentions refer to the exact same underlying technology, tool, project, company, or role.
2. The contextual scope of each entity:
   - "GLOBAL": Explicitly declared in the general technical skills section.
   - "PROJECT_SCOPED": Mentioned only within project descriptions.
   - "EXPERIENCE_SCOPED": Mentioned only within work experience descriptions.
   - "HYBRID": Declared globally in skills AND demonstrated contextually in projects/experience.
3. The directed relationships between entities (e.g. Skill -> USED_IN -> Project, Skill -> APPLIED_IN -> Experience).

STRICT RULES:
- NEVER invent or assume technologies, tools, projects, or experiences not explicitly listed in the candidate entity groups.
- If two mentions are ambiguous, evaluate their context carefully. For example, "Prisma ORM" in Skills and "Prisma" in a project refer to the same canonical technology "Prisma".
- Return ONLY valid JSON adhering to the specified schema.`;
  }

  /**
   * Builds the user prompt enclosing candidate entity groups in safe XML tags.
   *
   * @param {object} input
   * @param {Array<object>} input.candidateGroups Structured candidate comparison groups
   * @param {string} [input.resumeContext] Optional contextual summary
   * @returns {string} Sandboxed prompt
   */
  buildUserPrompt(input) {
    const sanitizedGroups = sanitizeData(input.candidateGroups || []);
    const sanitizedContext = sanitizeData(input.resumeContext || '');

    return `Please perform entity resolution and relationship extraction on the following extracted resume mentions:

<candidate_entity_groups>
${JSON.stringify(sanitizedGroups, null, 2)}
</candidate_entity_groups>

${
  sanitizedContext
    ? `<resume_context>
${sanitizedContext}
</resume_context>`
    : ''
}

Analyze each candidate group and output the resolved entities in structured JSON:
{
  "resolutions": [
    {
      "entityType": "SKILL" | "PROJECT" | "EXPERIENCE" | "EDUCATION",
      "canonicalName": "Canonical Name (e.g. Node.js, Prisma, PostgreSQL)",
      "canonicalSlug": "kebab-case-slug",
      "matchedAliases": ["list", "of", "raw", "mentions"],
      "scope": "GLOBAL" | "PROJECT_SCOPED" | "EXPERIENCE_SCOPED" | "HYBRID",
      "confidence": 0.0 to 1.0,
      "reasoning": "Brief explanation of why these mentions were unified",
      "relationships": [
        {
          "relationshipType": "USED_IN" | "APPLIED_IN" | "BELONGS_TO",
          "targetEntityName": "Target Project or Experience Name",
          "targetEntityType": "PROJECT" | "EXPERIENCE"
        }
      ]
    }
  ]
}`;
  }
}

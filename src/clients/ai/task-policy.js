/**
 * @file Dynamic AI Task Policy Registry (ARCH-026 / ADR-047)
 *
 * Configures model preferences, fallback targets, token ceilings, temperatures,
 * timeouts, and tool permissions per task category.
 */

import { TaskPolicySchema } from '../../domain/ai/ai.schemas.js';
import { AiInvalidRequestError } from '../../errors/ai.errors.js';

const CANONICAL_POLICIES = Object.freeze([
  {
    taskType: 'RESUME_WORDING',
    preferredModelId: 'gemini-3.7-flash',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 8000,
    maxOutputTokens: 2048,
    temperature: 0.2,
    timeoutMs: 10000,
    retryLimit: 2,
    requiresStructuredOutput: true,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'STANDARD',
  },
  {
    taskType: 'COVER_LETTER',
    preferredModelId: 'gemini-3.7-flash',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 8000,
    maxOutputTokens: 2048,
    temperature: 0.3,
    timeoutMs: 12000,
    retryLimit: 2,
    requiresStructuredOutput: true,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'STANDARD',
  },
  {
    taskType: 'JOB_EXPLANATION',
    preferredModelId: 'gemini-3.6-flash',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 6000,
    maxOutputTokens: 2048,
    temperature: 0.2,
    timeoutMs: 8000,
    retryLimit: 2,
    requiresStructuredOutput: false,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'LOW',
  },
  {
    taskType: 'CAREER_COACHING',
    preferredModelId: 'gemini-3.7-flash',
    fallbackModelId: 'gemini-3.6-flash',
    maxInputTokens: 8000,
    maxOutputTokens: 2048,
    temperature: 0.4,
    timeoutMs: 12000,
    retryLimit: 2,
    requiresStructuredOutput: false,
    allowsTools: true,
    allowsPreviewModel: false,
    costTier: 'STANDARD',
  },
  {
    taskType: 'PROJECT_CASE_STUDY',
    preferredModelId: 'gemini-3.7-flash',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 10000,
    maxOutputTokens: 4096,
    temperature: 0.2,
    timeoutMs: 15000,
    retryLimit: 2,
    requiresStructuredOutput: true,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'STANDARD',
  },
  {
    taskType: 'INTERVIEW_PREPARATION',
    preferredModelId: 'gemini-3.6-flash',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 8000,
    maxOutputTokens: 2048,
    temperature: 0.3,
    timeoutMs: 10000,
    retryLimit: 2,
    requiresStructuredOutput: true,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'STANDARD',
  },
  {
    taskType: 'JOB_PARSER_FALLBACK',
    preferredModelId: 'gemini-3.5-flash-lite',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 6000,
    maxOutputTokens: 1024,
    temperature: 0.1,
    timeoutMs: 6000,
    retryLimit: 2,
    requiresStructuredOutput: true,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'LOW',
  },
  {
    taskType: 'TITLE_NORMALIZATION',
    preferredModelId: 'gemini-3.5-flash-lite',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 2000,
    maxOutputTokens: 256,
    temperature: 0.0,
    timeoutMs: 4000,
    retryLimit: 2,
    requiresStructuredOutput: true,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'LOW',
  },
  {
    taskType: 'SYNTHETIC_HEALTH_CHECK',
    preferredModelId: 'gemini-3.5-flash-lite',
    fallbackModelId: 'gemini-2.5-flash',
    maxInputTokens: 500,
    maxOutputTokens: 64,
    temperature: 0.0,
    timeoutMs: 5000,
    retryLimit: 1,
    requiresStructuredOutput: false,
    allowsTools: false,
    allowsPreviewModel: false,
    costTier: 'LOW',
  },
]);

export class TaskPolicyRegistry {
  constructor(customPolicies = null) {
    this.policies = new Map();
    const initial = customPolicies || CANONICAL_POLICIES;
    for (const p of initial) {
      const validated = TaskPolicySchema.parse(p);
      this.policies.set(validated.taskType, validated);
    }
  }

  /**
   * Retrieves policy for a specific task type.
   *
   * @param {string} taskType Canonical AI task type
   * @returns {object} Validated task policy
   */
  getPolicy(taskType) {
    const policy = this.policies.get(taskType);
    if (!policy) {
      throw new AiInvalidRequestError(
        `Unknown AI taskType "${taskType}". No TaskPolicy registered.`,
        { taskType }
      );
    }
    return policy;
  }

  /**
   * Registers or overrides a task policy.
   *
   * @param {object} policyDef Task policy definition
   */
  registerPolicy(policyDef) {
    const validated = TaskPolicySchema.parse(policyDef);
    this.policies.set(validated.taskType, validated);
  }
}

export const defaultTaskPolicyRegistry = new TaskPolicyRegistry();
export default defaultTaskPolicyRegistry;

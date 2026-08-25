/**
 * @file Centralized AI Prompt Policy Registry & Barrel Exports (ARCH-026 / ADR-047)
 *
 * Provides a provider-neutral registry of task-specific prompt policies enforcing
 * universal zero-hallucination rules, XML sandboxing, and data minimization.
 */

import {
  BasePromptPolicy,
  UNIVERSAL_ZERO_HALLUCINATION_POLICY,
  sanitizeData,
  scrubPii,
} from './base-policy.js';
import { ResumeWordingPolicy } from './resume-wording.policy.js';
import { CoverLetterPolicy } from './cover-letter.policy.js';
import { JobExplanationPolicy } from './job-explanation.policy.js';
import { CareerCoachingPolicy } from './career-coaching.policy.js';
import { ProjectCaseStudyPolicy } from './project-case-study.policy.js';
import { ProjectImprovementPolicy } from './project-improvement.policy.js';

export {
  BasePromptPolicy,
  ResumeWordingPolicy,
  CoverLetterPolicy,
  JobExplanationPolicy,
  CareerCoachingPolicy,
  ProjectCaseStudyPolicy,
  ProjectImprovementPolicy,
  UNIVERSAL_ZERO_HALLUCINATION_POLICY,
  sanitizeData,
  scrubPii,
};

/**
 * Registry of specialized prompt policies indexed by task type.
 */
export class PromptPolicyRegistry {
  constructor() {
    this._policies = new Map([
      ['RESUME_WORDING', new ResumeWordingPolicy()],
      ['COVER_LETTER', new CoverLetterPolicy()],
      ['JOB_EXPLANATION', new JobExplanationPolicy()],
      ['CAREER_COACHING', new CareerCoachingPolicy()],
      ['PROJECT_CASE_STUDY', new ProjectCaseStudyPolicy()],
      ['PROJECT_IMPROVEMENT', new ProjectImprovementPolicy()],
    ]);

    this._defaultPolicy = new BasePromptPolicy({
      policyId: 'BASE_CAREER',
      policyVersion: '1.0.0',
      taskDescription:
        'Provide evidence-grounded career reasoning strictly adhering to verified facts.',
    });
  }

  /**
   * Retrieves the prompt policy for a given task type.
   *
   * @param {string} taskType Canonical AI task type
   * @returns {BasePromptPolicy}
   */
  getPolicy(taskType) {
    if (this._policies.has(taskType)) {
      return this._policies.get(taskType);
    }
    return this._defaultPolicy;
  }

  /**
   * Checks if a specialized policy exists for a given task type.
   *
   * @param {string} taskType
   * @returns {boolean}
   */
  hasPolicy(taskType) {
    return this._policies.has(taskType);
  }

  /**
   * Lists all registered prompt policies with metadata.
   *
   * @returns {Array<{ policyId: string, policyVersion: string, taskDescription: string }>}
   */
  listPolicies() {
    const list = Array.from(this._policies.values()).map((p) => ({
      policyId: p.policyId,
      policyVersion: p.policyVersion,
      taskDescription: p.taskDescription,
    }));
    list.push({
      policyId: this._defaultPolicy.policyId,
      policyVersion: this._defaultPolicy.policyVersion,
      taskDescription: this._defaultPolicy.taskDescription,
    });
    return list;
  }

  /**
   * Builds a complete, sandboxed prompt envelope using the policy for the given task.
   *
   * @param {import('../../../domain/ai/ai.schemas.js').AiGenerationRequest} request
   * @returns {{ systemInstruction: string, contents: string, policyId: string, policyVersion: string }}
   */
  buildEnvelope(request) {
    const policy = this.getPolicy(request.taskType);
    return policy.buildEnvelope({
      prompt: request.prompt,
      candidateFacts: request.candidateFacts,
      approvedAssertions: request.approvedAssertions,
      verifiedEvidence: request.verifiedEvidence,
      jobRequirements: request.jobRequirements,
      untrustedContent: request.untrustedContent,
      systemInstruction: request.systemInstruction,
    });
  }
}

/**
 * Singleton instance of the PromptPolicyRegistry.
 */
export const defaultPromptPolicyRegistry = new PromptPolicyRegistry();

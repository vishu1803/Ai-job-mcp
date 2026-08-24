/**
 * @file Gemini Structured Prompt Builder & PII Sanitizer (ARCH-026 / ADR-047)
 *
 * Enforces structured prompt boundaries (<system_policy>, <candidate_facts>,
 * <approved_assertions>, <verified_evidence>, <job_requirements>,
 * <untrusted_job_description>, <passive_repository_data>, <task_instruction>)
 * and scrubs PII/secrets prior to dispatching payloads to external AI endpoints.
 */

import {
  defaultPromptPolicyRegistry,
  sanitizeData,
  scrubPii,
  UNIVERSAL_ZERO_HALLUCINATION_POLICY,
} from '../ai/prompt-policies/index.js';

export { scrubPii, sanitizeData as sanitizeObject, UNIVERSAL_ZERO_HALLUCINATION_POLICY };

/**
 * Standard System Policy Header for Evidence-Grounded Career Reasoning.
 */
export const DEFAULT_CAREER_SYSTEM_INSTRUCTION = `You are Antigravity Career Hub's evidence-grounded AI copilot.
Your mission is to provide accurate, impactful career assistance strictly grounded in verified facts.

${UNIVERSAL_ZERO_HALLUCINATION_POLICY}`;

/**
 * Constructs a fully sandboxed, delimited prompt payload using task-specific policies.
 *
 * @param {object} params Prompt components
 * @param {string} [params.taskType] Canonical AI task type (e.g. RESUME_WORDING, COVER_LETTER)
 * @param {string} params.prompt Primary user / task prompt
 * @param {string} [params.systemInstruction] Optional system instruction override
 * @param {object} [params.candidateFacts] Verified candidate profile facts
 * @param {object} [params.approvedAssertions] Verified assertions from ZeroHallucinationIntegrityService
 * @param {object} [params.verifiedEvidence] Verified EvidenceItem records
 * @param {object} [params.jobRequirements] Parsed job requirements
 * @param {object} [params.untrustedContent] Untrusted job description or user-pasted text
 * @returns {{ systemInstruction: string, contents: string, policyId: string, policyVersion: string }}
 */
export function buildGeminiPromptEnvelope({
  taskType,
  prompt,
  systemInstruction,
  candidateFacts,
  approvedAssertions,
  verifiedEvidence,
  jobRequirements,
  untrustedContent,
}) {
  const policy = defaultPromptPolicyRegistry.getPolicy(taskType || 'BASE_CAREER');

  const envelope = policy.buildEnvelope({
    prompt,
    candidateFacts,
    approvedAssertions,
    verifiedEvidence,
    jobRequirements,
    untrustedContent,
    systemInstruction,
  });

  return envelope;
}

/**
 * @file Unit Tests for Resume Entity Resolution Prompt Policy (ARCH-026 / ADR-047).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResumeEntityResolutionPolicy } from '../../src/clients/ai/prompt-policies/resume-entity-resolution.policy.js';
import { PromptPolicyRegistry } from '../../src/clients/ai/prompt-policies/index.js';

describe('ResumeEntityResolutionPolicy', () => {
  it('should initialize with correct task policy attributes', () => {
    const policy = new ResumeEntityResolutionPolicy();
    assert.equal(policy.policyId, 'RESUME_ENTITY_RESOLUTION');
    assert.equal(policy.policyVersion, '1.0.0');
    assert.ok(policy.taskDescription.includes('Disambiguate extracted resume mentions'));
  });

  it('should be registered in PromptPolicyRegistry under RESUME_ENTITY_RESOLUTION', () => {
    const registry = new PromptPolicyRegistry();
    const policy = registry.getPolicy('RESUME_ENTITY_RESOLUTION');
    assert.ok(policy instanceof ResumeEntityResolutionPolicy);
  });

  it('should build system prompt with zero-hallucination policy and scope definitions', () => {
    const policy = new ResumeEntityResolutionPolicy();
    const sysPrompt = policy.buildSystemPrompt();

    assert.ok(sysPrompt.includes('UNIVERSAL ZERO-HALLUCINATION POLICY'));
    assert.ok(sysPrompt.includes('"GLOBAL"'));
    assert.ok(sysPrompt.includes('"PROJECT_SCOPED"'));
    assert.ok(sysPrompt.includes('"EXPERIENCE_SCOPED"'));
    assert.ok(sysPrompt.includes('"HYBRID"'));
    assert.ok(sysPrompt.includes('NEVER invent or assume technologies'));
  });

  it('should build user prompt with XML sandboxed candidate entity groups', () => {
    const policy = new ResumeEntityResolutionPolicy();
    const input = {
      candidateGroups: [
        {
          groupName: 'Prisma Cluster',
          mentions: [
            { text: 'Prisma ORM', section: 'SKILLS' },
            { text: 'Prisma', section: 'PROJECTS', project: 'Collaborative Task Manager' },
          ],
        },
      ],
      resumeContext: 'Software engineering candidate with TypeScript and PostgreSQL focus',
    };

    const userPrompt = policy.buildUserPrompt(input);
    assert.ok(userPrompt.includes('<candidate_entity_groups>'));
    assert.ok(userPrompt.includes('Prisma ORM'));
    assert.ok(userPrompt.includes('Collaborative Task Manager'));
    assert.ok(userPrompt.includes('</candidate_entity_groups>'));
    assert.ok(userPrompt.includes('<resume_context>'));
    assert.ok(userPrompt.includes('</resume_context>'));
    assert.ok(userPrompt.includes('"resolutions"'));
  });
});

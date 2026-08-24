/**
 * @file Integration Tests for Gemini System Prompts & Task Policies (P8-002 / ARCH-026)
 *
 * Validates deterministic Gemini provider behavior across all 5 specialized task policies
 * using mock SDK clients (zero live external API calls, zero rate-limit retries):
 * 1. RESUME_WORDING: Verifies prompt envelope, policy constraints, and structured active-voice output.
 * 2. COVER_LETTER: Verifies tailored narrative policy and ungrounded claim defenses.
 * 3. JOB_EXPLANATION: Verifies match breakdown policy and deterministic score preservation.
 * 4. CAREER_COACHING: Verifies coaching policy and non-speculative outcome boundaries.
 * 5. PROJECT_CASE_STUDY: Verifies technical case study policy and anti-metric-fabrication rules.
 */

import '../../src/config/env.js';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { GeminiProviderAdapter } from '../../src/clients/gemini/gemini-adapter.js';
import { closeDatabase } from '../../src/db/index.js';

describe('Gemini Prompt Policies & Trust Boundary Deterministic Integration Tests (P8-002)', () => {
  after(async () => {
    await closeDatabase();

    // Clean up any remaining idle keep-alive handles
    if (typeof process._getActiveHandles === 'function') {
      const handles = process._getActiveHandles();
      for (const h of handles) {
        if (
          h &&
          typeof h.unref === 'function' &&
          h !== process.stdout &&
          h !== process.stderr &&
          h !== process.stdin
        ) {
          h.unref();
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. RESUME_WORDING Policy Integration
  // ---------------------------------------------------------------------------
  it('1. RESUME_WORDING prompt policy validates structured bullet generation and zero-hallucination policy', async () => {
    let capturedConfig = null;
    let capturedContents = null;

    const mockSdk = {
      models: {
        generateContent: async (params) => {
          capturedConfig = params.config;
          capturedContents = params.contents;
          return {
            text: JSON.stringify({
              activeVoiceBullet:
                'Refactored backend microservice HTTP router in Go, reducing latency.',
              technologiesIncluded: ['Go'],
              metricFabricated: false,
            }),
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 180,
              candidatesTokenCount: 35,
              totalTokenCount: 215,
            },
          };
        },
      },
    };

    const adapter = new GeminiProviderAdapter({ sdkClient: mockSdk });

    const ResumeOutputSchema = z.object({
      activeVoiceBullet: z.string().min(1),
      technologiesIncluded: z.array(z.string()),
      metricFabricated: z.boolean(),
    });

    const res = await adapter.generateStructured({
      taskType: 'RESUME_WORDING',
      prompt: 'Rewrite candidate fact into a high-impact resume bullet point.',
      candidateFacts: {
        role: 'Synthetic Cloud Engineer',
        skill: 'Go',
        action: 'Refactored backend microservice HTTP router',
      },
      responseSchema: ResumeOutputSchema,
    });

    assert.strictEqual(
      res.data.activeVoiceBullet,
      'Refactored backend microservice HTTP router in Go, reducing latency.'
    );
    assert.strictEqual(res.data.metricFabricated, false);
    assert.strictEqual(res.provider, 'gemini');
    assert.strictEqual(res.metadata.policyId, 'RESUME_WORDING');
    assert.strictEqual(res.metadata.policyVersion, '1.0.0');
    assert.strictEqual(res.usage.totalTokens, 215);

    // Verify system instruction contains RESUME_WORDING constraints
    const systemText =
      typeof capturedConfig?.systemInstruction === 'string'
        ? capturedConfig.systemInstruction
        : (capturedConfig?.systemInstruction?.parts?.[0]?.text ?? '');
    assert.ok(systemText.includes('RESUME_WORDING'), 'Must include RESUME_WORDING policy');
    assert.ok(systemText.includes('NEVER invent or exaggerate quantitative metrics'));

    // Verify prompt sandboxing XML structure
    const promptText =
      typeof capturedContents === 'string'
        ? capturedContents
        : (capturedContents?.parts?.[0]?.text ?? '');
    assert.ok(promptText.includes('<candidate_facts>'));
    assert.ok(promptText.includes('<task_instruction>'));
  });

  // ---------------------------------------------------------------------------
  // 2. COVER_LETTER Policy Integration
  // ---------------------------------------------------------------------------
  it('2. COVER_LETTER prompt policy generates tailored narrative without ungrounded claims', async () => {
    let capturedConfig = null;

    const mockSdk = {
      models: {
        generateContent: async (params) => {
          capturedConfig = params.config;
          return {
            text: JSON.stringify({
              salutation: 'Dear Hiring Team at SyntheticCorp,',
              openingParagraph:
                'I am writing to express my strong interest in the Backend Developer position.',
              closingParagraph:
                'Thank you for your time and consideration. I look forward to discussing my experience.',
              unsupportedClaimsIncluded: false,
            }),
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 220,
              candidatesTokenCount: 50,
              totalTokenCount: 270,
            },
          };
        },
      },
    };

    const adapter = new GeminiProviderAdapter({ sdkClient: mockSdk });

    const CoverLetterSchema = z.object({
      salutation: z.string(),
      openingParagraph: z.string().min(1),
      closingParagraph: z.string().min(1),
      unsupportedClaimsIncluded: z.boolean(),
    });

    const res = await adapter.generateStructured({
      taskType: 'COVER_LETTER',
      prompt:
        'Draft opening and closing paragraphs for Backend Developer application at SyntheticCorp.',
      candidateFacts: {
        displayName: 'Synthetic Alice',
        verifiedSkills: ['TypeScript', 'Node.js', 'PostgreSQL'],
      },
      jobRequirements: {
        targetCompany: 'SyntheticCorp',
        targetRole: 'Backend Developer',
        primarySkill: 'TypeScript',
      },
      responseSchema: CoverLetterSchema,
    });

    assert.ok(res.data.openingParagraph.length > 0);
    assert.ok(res.data.closingParagraph.length > 0);
    assert.strictEqual(res.data.unsupportedClaimsIncluded, false);
    assert.strictEqual(res.metadata.policyId, 'COVER_LETTER');
    assert.strictEqual(res.metadata.policyVersion, '1.0.0');

    const systemText =
      typeof capturedConfig?.systemInstruction === 'string'
        ? capturedConfig.systemInstruction
        : (capturedConfig?.systemInstruction?.parts?.[0]?.text ?? '');
    assert.ok(systemText.includes('COVER_LETTER'));
    assert.ok(systemText.includes('NEVER invent company culture'));
  });

  // ---------------------------------------------------------------------------
  // 3. JOB_EXPLANATION Policy Integration
  // ---------------------------------------------------------------------------
  it('3. JOB_EXPLANATION prompt policy explains match status without altering score', async () => {
    let capturedConfig = null;

    const mockSdk = {
      models: {
        generateContent: async (params) => {
          capturedConfig = params.config;
          return {
            text: JSON.stringify({
              matchSummary:
                'TypeScript is verified in candidate repositories with high evidence quality.',
              identifiedGapExplanation:
                'Rust is listed as a required skill but is missing from verified projects.',
              unverifiedStatusAssigned: false,
            }),
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 200,
              candidatesTokenCount: 45,
              totalTokenCount: 245,
            },
          };
        },
      },
    };

    const adapter = new GeminiProviderAdapter({ sdkClient: mockSdk });

    const JobExplanationSchema = z.object({
      matchSummary: z.string().min(1),
      identifiedGapExplanation: z.string().min(1),
      unverifiedStatusAssigned: z.boolean(),
    });

    const res = await adapter.generateStructured({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Explain TypeScript match and Rust skill gap.',
      candidateFacts: {
        verifiedSkills: ['TypeScript'],
        missingSkills: ['Rust'],
      },
      jobRequirements: {
        requiredSkills: ['TypeScript', 'Rust'],
        deterministicAtsScore: 75,
      },
      responseSchema: JobExplanationSchema,
    });

    assert.ok(res.data.matchSummary.length > 0);
    assert.ok(res.data.identifiedGapExplanation.length > 0);
    assert.strictEqual(res.data.unverifiedStatusAssigned, false);
    assert.strictEqual(res.metadata.policyId, 'JOB_EXPLANATION');

    const systemText =
      typeof capturedConfig?.systemInstruction === 'string'
        ? capturedConfig.systemInstruction
        : (capturedConfig?.systemInstruction?.parts?.[0]?.text ?? '');
    assert.ok(systemText.includes('JOB_EXPLANATION'));
    assert.ok(
      systemText.includes('NEVER alter, re-estimate, or override mathematical ATS fit scores')
    );
  });

  // ---------------------------------------------------------------------------
  // 4. CAREER_COACHING Policy Integration
  // ---------------------------------------------------------------------------
  it('4. CAREER_COACHING prompt policy provides guidance without speculative outcome promises', async () => {
    let capturedConfig = null;

    const mockSdk = {
      models: {
        generateContent: async (params) => {
          capturedConfig = params.config;
          return {
            text: JSON.stringify({
              recommendedLearningSteps: [
                'Complete The Rust Book chapters 1-8',
                'Build a CLI tool in Rust',
              ],
              interviewPreparationTip: 'Be prepared to explain ownership and borrowing models.',
              hiringGuaranteeMade: false,
            }),
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 210,
              candidatesTokenCount: 40,
              totalTokenCount: 250,
            },
          };
        },
      },
    };

    const adapter = new GeminiProviderAdapter({ sdkClient: mockSdk });

    const CoachingSchema = z.object({
      recommendedLearningSteps: z.array(z.string()).min(1),
      interviewPreparationTip: z.string().min(1),
      hiringGuaranteeMade: z.boolean(),
    });

    const res = await adapter.generateStructured({
      taskType: 'CAREER_COACHING',
      prompt: 'Provide 2 learning steps to acquire Rust fundamentals for a TypeScript developer.',
      candidateFacts: {
        currentProficiency: ['TypeScript'],
        targetSkill: 'Rust',
      },
      responseSchema: CoachingSchema,
    });

    assert.strictEqual(res.data.recommendedLearningSteps.length, 2);
    assert.ok(res.data.interviewPreparationTip.length > 0);
    assert.strictEqual(res.data.hiringGuaranteeMade, false);
    assert.strictEqual(res.metadata.policyId, 'CAREER_COACHING');

    const systemText =
      typeof capturedConfig?.systemInstruction === 'string'
        ? capturedConfig.systemInstruction
        : (capturedConfig?.systemInstruction?.parts?.[0]?.text ?? '');
    assert.ok(systemText.includes('CAREER_COACHING'));
    assert.ok(systemText.includes('NEVER promise, predict, or guarantee employment outcomes'));
  });

  // ---------------------------------------------------------------------------
  // 5. PROJECT_CASE_STUDY Policy Integration
  // ---------------------------------------------------------------------------
  it('5. PROJECT_CASE_STUDY prompt policy generates architecture narrative without metric fabrication', async () => {
    let capturedConfig = null;

    const mockSdk = {
      models: {
        generateContent: async (params) => {
          capturedConfig = params.config;
          return {
            text: JSON.stringify({
              problemStatement:
                'Distributed state synchronization across unreliable network nodes.',
              architecturalSolution:
                'Implemented Raft consensus algorithm using Go and gRPC for RPC communication.',
              fictionalMetricsIncluded: false,
            }),
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 230,
              candidatesTokenCount: 45,
              totalTokenCount: 275,
            },
          };
        },
      },
    };

    const adapter = new GeminiProviderAdapter({ sdkClient: mockSdk });

    const CaseStudySchema = z.object({
      problemStatement: z.string().min(1),
      architecturalSolution: z.string().min(1),
      fictionalMetricsIncluded: z.boolean(),
    });

    const res = await adapter.generateStructured({
      taskType: 'PROJECT_CASE_STUDY',
      prompt: 'Draft architectural summary of distributed key-value store.',
      candidateFacts: {
        projectName: 'SyntheticKV',
        verifiedTechnologies: ['Go', 'Raft Consensus', 'gRPC'],
      },
      responseSchema: CaseStudySchema,
    });

    assert.ok(res.data.problemStatement.length > 0);
    assert.ok(res.data.architecturalSolution.length > 0);
    assert.strictEqual(res.data.fictionalMetricsIncluded, false);
    assert.strictEqual(res.metadata.policyId, 'PROJECT_CASE_STUDY');

    const systemText =
      typeof capturedConfig?.systemInstruction === 'string'
        ? capturedConfig.systemInstruction
        : (capturedConfig?.systemInstruction?.parts?.[0]?.text ?? '');
    assert.ok(systemText.includes('PROJECT_CASE_STUDY'));
    assert.ok(systemText.includes('NEVER invent production traffic numbers'));
  });
});

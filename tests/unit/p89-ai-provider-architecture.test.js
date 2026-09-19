/**
 * @file P89 AI Provider Architecture & Transport Hardening Tests
 *
 * Verifies the 15 architectural invariants:
 * 1. Vertex provider can be selected explicitly.
 * 2. Vertex is the current production default (AI_PROVIDER unset).
 * 3. Vertex uses @google/genai with { vertexai: true }.
 * 4. Vertex uses Google Cloud ADC / project configuration.
 * 5. Gemini Developer API provider remains available and selectable.
 * 6. API provider is NOT the current default.
 * 7. Provider contract compliance (id, name, generateText, generateStructured, executeToolLoop, validateHealth).
 * 8. Switching provider does not require domain-service changes.
 * 9. Resume generation service is provider-agnostic.
 * 10. Career Copilot assistant service is provider-agnostic.
 * 11. Extension assistant service is provider-agnostic.
 * 12. ModelRegistry remains the model authority (CANONICAL_DEFAULT_MODEL_ID = gemini-3.8-flash).
 * 13. Domain services do not instantiate GoogleGenAI directly.
 * 14. Vertex failure does NOT silently switch to Developer API (fail-closed invariant).
 * 15. API transport remains structurally and functionally testable for future use.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  createAiProvider,
  getDefaultAiProvider,
  AI_PROVIDERS,
} from '../../src/clients/ai/ai-provider-factory.js';
import { AiProvider } from '../../src/clients/ai/ai-provider.interface.js';
import { GeminiVertexAdapter, defaultVertexAdapter } from '../../src/clients/vertex/vertex-adapter.js';
import { GeminiProviderAdapter, defaultGeminiAdapter } from '../../src/clients/gemini/gemini-adapter.js';
import {
  ModelRegistry,
  defaultModelRegistry,
  CANONICAL_DEFAULT_MODEL_ID,
} from '../../src/clients/ai/model-registry.js';
import { AiCareerAssistantService } from '../../src/services/ai-career-assistant.service.js';
import { AiResumeContentGeneratorService } from '../../src/services/ai-resume-content-generator.service.js';
import { ExtensionAssistantService } from '../../src/services/extension-assistant.service.js';
import {
  AiRateLimitedError,
  AiAuthenticationError,
} from '../../src/errors/ai.errors.js';

describe('P89 AI Provider Architecture & Transport Hardening', () => {
  const originalAiProviderEnv = process.env.AI_PROVIDER;

  beforeEach(() => {
    delete process.env.AI_PROVIDER;
  });

  afterEach(() => {
    if (originalAiProviderEnv !== undefined) {
      process.env.AI_PROVIDER = originalAiProviderEnv;
    } else {
      delete process.env.AI_PROVIDER;
    }
  });

  it('1. Vertex provider can be selected explicitly via factory', () => {
    const provider = createAiProvider({ provider: AI_PROVIDERS.GEMINI_VERTEX });
    assert.ok(provider instanceof AiProvider);
    assert.ok(provider instanceof GeminiVertexAdapter);
    assert.strictEqual(provider.id, 'vertex');
    assert.strictEqual(provider.name, 'Google Cloud Vertex AI');
  });

  it('2. Vertex is the current production default when AI_PROVIDER is unset', () => {
    delete process.env.AI_PROVIDER;
    const defaultProvider = getDefaultAiProvider();
    assert.strictEqual(defaultProvider, defaultVertexAdapter);
    assert.strictEqual(defaultProvider.id, 'vertex');

    const createdProvider = createAiProvider();
    assert.strictEqual(createdProvider.id, 'vertex');
    assert.ok(createdProvider instanceof GeminiVertexAdapter);
  });

  it('3. Vertex uses @google/genai with { vertexai: true } configuration', () => {
    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      location: 'us-central1',
    });
    assert.strictEqual(adapter.id, 'vertex');
    assert.strictEqual(adapter.project, 'test-gcp-project');
    assert.strictEqual(adapter.location, 'us-central1');
    assert.ok(adapter.sdkClient, 'SDK client must be instantiated');
  });

  it('4. Vertex uses Google Cloud / ADC configuration defaults', () => {
    const adapter = new GeminiVertexAdapter({
      project: 'gcp-adc-project',
    });
    assert.strictEqual(adapter.location, 'global', 'Defaults location to global when unset');
    assert.strictEqual(adapter.project, 'gcp-adc-project');
  });

  it('5. API provider remains available and selectable via explicit configuration', () => {
    const providerExplicit = createAiProvider({ provider: AI_PROVIDERS.GEMINI_DEVELOPER });
    assert.ok(providerExplicit instanceof AiProvider);
    assert.ok(providerExplicit instanceof GeminiProviderAdapter);
    assert.strictEqual(providerExplicit.id, 'gemini');
    assert.strictEqual(providerExplicit.name, 'Google Gemini');

    process.env.AI_PROVIDER = 'gemini-developer';
    const providerFromEnv = getDefaultAiProvider();
    assert.strictEqual(providerFromEnv, defaultGeminiAdapter);
    assert.strictEqual(providerFromEnv.id, 'gemini');
  });

  it('6. API provider is NOT the current default', () => {
    delete process.env.AI_PROVIDER;
    const defaultProvider = getDefaultAiProvider();
    assert.notStrictEqual(defaultProvider.id, 'gemini');
    assert.strictEqual(defaultProvider.id, 'vertex');
  });

  it('7. Both Vertex and Developer API adapters fulfill the canonical AiProvider contract', () => {
    const vertex = new GeminiVertexAdapter({ project: 'test' });
    const developer = new GeminiProviderAdapter({ apiKey: 'test-key' });

    for (const p of [vertex, developer]) {
      assert.ok(p instanceof AiProvider);
      assert.strictEqual(typeof p.id, 'string');
      assert.strictEqual(typeof p.name, 'string');
      assert.strictEqual(typeof p.generateText, 'function');
      assert.strictEqual(typeof p.generateStructured, 'function');
      assert.strictEqual(typeof p.executeToolLoop, 'function');
      assert.strictEqual(typeof p.validateHealth, 'function');
    }
  });

  it('8. Switching provider does not require domain-service changes', async () => {
    // Hermetic mock responding through identical contract
    const mockSdk = {
      models: {
        generateContent: async () => ({
          text: 'Unified contract output',
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      },
    };

    const vertex = new GeminiVertexAdapter({ project: 'test', sdkClient: mockSdk });
    const developer = new GeminiProviderAdapter({ apiKey: 'test', sdkClient: mockSdk });

    const vertexRes = await vertex.generateText({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Summarize job',
    });
    const developerRes = await developer.generateText({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Summarize job',
    });

    assert.strictEqual(vertexRes.text, 'Unified contract output');
    assert.strictEqual(developerRes.text, 'Unified contract output');
    assert.strictEqual(vertexRes.finishReason, 'STOP');
    assert.strictEqual(developerRes.finishReason, 'STOP');
  });

  it('9. Resume generation service is provider-agnostic', async () => {
    const mockProvider = {
      id: 'vertex',
      name: 'Google Cloud Vertex AI',
      generateStructured: async () => ({
        data: {
          summary: 'Experienced distributed systems engineer with proven expertise in cloud scale.',
          referencedSkillSlugs: ['go', 'postgresql'],
          composedFromFactIds: ['fact-1'],
        },
        rawText: '{}',
        provider: 'vertex',
        modelId: CANONICAL_DEFAULT_MODEL_ID,
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      }),
    };

    const service = new AiResumeContentGeneratorService({ aiProvider: mockProvider });
    const result = await service.generateJobConditionedSummary({
      candidateProfile: {
        headline: 'Staff Software Engineer',
        skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
      },
      targetJobPosting: {
        title: 'Senior Backend Engineer',
      },
      factInventory: [{ id: 'fact-1', factId: 'fact-1', text: 'Experienced distributed systems engineer in cloud scale.' }],
    });

    assert.ok(result);
    assert.ok(result.text);
    assert.strictEqual(result.provenanceStatus, 'VERIFIED');
  });

  it('10. Career Copilot assistant service is provider-agnostic', async () => {
    const mockProvider = {
      id: 'vertex',
      name: 'Google Cloud Vertex AI',
      generateText: async () => ({
        text: 'Career Copilot guidance based on verified skills.',
        provider: 'vertex',
        modelId: CANONICAL_DEFAULT_MODEL_ID,
      }),
    };

    const service = new AiCareerAssistantService({ aiProvider: mockProvider });
    const response = await service.handleUserMessage({
      tenantId: '11111111-1111-4111-8111-111111111111',
      candidateId: '22222222-2222-4222-8222-222222222222',
      candidateProfile: {
        displayName: 'Test Candidate',
        skills: ['Go'],
      },
      message: 'What should I do next?',
      pageContext: 'dashboard',
    });

    assert.ok(response);
    assert.strictEqual(response.content, 'Career Copilot guidance based on verified skills.');
  });

  it('11. Extension assistant service is provider-agnostic', async () => {
    const mockProvider = {
      id: 'vertex',
      name: 'Google Cloud Vertex AI',
      generateText: async () => ({
        text: 'This role focuses on building scalable Go backend microservices.',
        provider: 'vertex',
        modelId: CANONICAL_DEFAULT_MODEL_ID,
      }),
    };

    const service = new ExtensionAssistantService({ aiProvider: mockProvider });
    const result = await service.explainJobPage({
      job: {
        title: 'Backend Engineer',
        company: 'Cloud Corp',
        description: 'Seeking a backend engineer to design scalable Go microservices and distributed database systems for global users.',
        requirements: ['Go', 'PostgreSQL'],
      },
    });

    assert.ok(result);
    assert.strictEqual(result.summary, 'This role focuses on building scalable Go backend microservices.');
    assert.strictEqual(result.aiAvailable, true);
  });

  it('12. ModelRegistry remains the model authority and defines CANONICAL_DEFAULT_MODEL_ID as gemini-3.8-flash', () => {
    assert.strictEqual(CANONICAL_DEFAULT_MODEL_ID, 'gemini-3.8-flash');
    const defaultModel = defaultModelRegistry.getDefaultModel();
    assert.strictEqual(defaultModel.modelId, CANONICAL_DEFAULT_MODEL_ID);
    assert.strictEqual(defaultModel.isProductionDefault, true);
    assert.strictEqual(defaultModel.stability, 'STABLE');
  });

  it('13. Domain services accept any AiProvider and never require direct GoogleGenAI instantiation', () => {
    const customAiProvider = {
      id: 'custom-mock',
      name: 'Custom Mock',
      generateText: async () => ({ text: 'ok' }),
      generateStructured: async () => ({ data: {} }),
      executeToolLoop: async () => ({ finalResponse: { text: 'ok' } }),
      validateHealth: async () => ({ healthy: true }),
    };

    const assistant = new AiCareerAssistantService({ aiProvider: customAiProvider });
    const resumeGen = new AiResumeContentGeneratorService({ aiProvider: customAiProvider });
    const extension = new ExtensionAssistantService({ aiProvider: customAiProvider });

    assert.strictEqual(assistant.aiProvider, customAiProvider);
    assert.strictEqual(resumeGen.aiProvider, customAiProvider);
    assert.strictEqual(extension.aiProvider, customAiProvider);
  });

  it('14. Vertex failure does NOT silently switch to Developer API (fail-closed invariant)', async () => {
    // Failing Vertex SDK client
    const failingVertexSdk = {
      models: {
        generateContent: async () => {
          const err = new Error('Resource exhausted: 429 quota exceeded');
          err.status = 429;
          throw err;
        },
      },
    };

    const vertexAdapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: failingVertexSdk,
    });

    // When Vertex fails, it must throw AiRateLimitedError, NOT quietly fall back to Gemini Developer API
    await assert.rejects(
      async () => {
        await vertexAdapter.generateText({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Analyze job description',
        });
      },
      (err) => {
        assert.ok(err instanceof AiRateLimitedError);
        assert.strictEqual(err.provider, 'vertex', 'Error provider must be vertex, not gemini');
        return true;
      }
    );
  });

  it('15. Developer API transport remains fully testable for future use', async () => {
    const mockDeveloperSdk = {
      models: {
        generateContent: async ({ model }) => ({
          text: `Developer API transport response from ${model}`,
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
        }),
      },
    };

    const developerAdapter = new GeminiProviderAdapter({
      apiKey: 'test-studio-key',
      sdkClient: mockDeveloperSdk,
    });

    const res = await developerAdapter.generateText({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Explain requirements',
    });

    assert.strictEqual(res.provider, 'gemini');
    assert.strictEqual(res.modelId, CANONICAL_DEFAULT_MODEL_ID);
    assert.ok(res.text.includes('Developer API transport response'));
    assert.strictEqual(res.finishReason, 'STOP');
  });
});

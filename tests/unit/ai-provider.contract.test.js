/**
 * @file Provider Contract Tests (ARCH-026 / ADR-047)
 *
 * Verifies that any AI provider adapter conforms to the canonical AiProvider contract.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AiProvider } from '../../src/clients/ai/ai-provider.interface.js';
import { GeminiProviderAdapter } from '../../src/clients/gemini/gemini-adapter.js';

describe('AiProvider Contract Tests (P8-001)', () => {
  // 1. Base Class Abstract Protection
  it('1. AiProvider cannot be instantiated directly', () => {
    assert.throws(() => new AiProvider('mock', 'Mock Provider'), TypeError);
  });

  // 2. Concrete Implementation Contract Adherence
  it('2. GeminiProviderAdapter implements all AiProvider interface methods', async () => {
    const mockSdk = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({ message: 'Contract pass' }),
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
        }),
      },
    };

    const provider = new GeminiProviderAdapter({ sdkClient: mockSdk });

    assert.strictEqual(provider.id, 'gemini');
    assert.strictEqual(provider.name, 'Google Gemini');
    assert.strictEqual(typeof provider.generateText, 'function');
    assert.strictEqual(typeof provider.generateStructured, 'function');
    assert.strictEqual(typeof provider.executeToolLoop, 'function');
    assert.strictEqual(typeof provider.validateHealth, 'function');

    // Test generateText
    const textRes = await provider.generateText({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Explain requirements',
    });
    assert.ok(textRes.text);
    assert.strictEqual(textRes.provider, 'gemini');

    // Test generateStructured
    const structRes = await provider.generateStructured({
      taskType: 'RESUME_WORDING',
      prompt: 'Structure bullets',
      responseSchema: z.object({ message: z.string() }),
    });
    assert.strictEqual(structRes.data.message, 'Contract pass');

    // Test validateHealth
    const health = await provider.validateHealth();
    assert.strictEqual(health.healthy, true);
  });
});

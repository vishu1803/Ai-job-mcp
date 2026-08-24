/**
 * @file Unit Tests for Google Cloud Vertex AI Provider Adapter (P8-004)
 *
 * Verifies GeminiVertexAdapter initialization, ADC configuration, text generation,
 * Zod schema structured output, bounded tool loops, error normalization, retry/fallback,
 * and safety handling using hermetic mock SDK clients (100% deterministic, 0 network).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { GeminiVertexAdapter } from '../../src/clients/vertex/vertex-adapter.js';
import {
  AiAuthenticationError,
  AiInvalidRequestError,
  AiOutputSchemaError,
  AiRateLimitedError,
  AiSafetyBlockedError,
  AiTimeoutError,
  AiToolLoopExhaustedError,
} from '../../src/errors/ai.errors.js';

describe('Vertex AI Provider Adapter Unit Tests (P8-004)', () => {
  // 1. Initialization and Configuration
  it('1. initializes with explicit project and location defaults', () => {
    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      location: 'us-central1',
    });

    assert.strictEqual(adapter.id, 'vertex');
    assert.strictEqual(adapter.name, 'Google Cloud Vertex AI');
    assert.strictEqual(adapter.project, 'test-gcp-project');
    assert.strictEqual(adapter.location, 'us-central1');
    assert.ok(adapter.sdkClient);
  });

  it('2. defaults location to "global" when unconfigured', () => {
    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
    });

    assert.strictEqual(adapter.location, 'global');
  });

  it('3. throws normalized error when project and sdkClient are missing', async () => {
    const adapter = new GeminiVertexAdapter({
      project: '',
      sdkClient: null,
    });

    await assert.rejects(
      async () => {
        await adapter.generateText({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Explain requirements',
        });
      },
      (err) => {
        assert.ok(
          err instanceof AiAuthenticationError || err instanceof AiInvalidRequestError || err.code
        );
        return true;
      }
    );
  });

  // 2. Text Generation
  it('4. generateText returns normalized response with usage tokens and finish reason', async () => {
    const mockSdk = {
      models: {
        generateContent: async ({ model, contents, config }) => {
          assert.strictEqual(model, 'gemini-3.7-flash');
          assert.ok(contents);
          assert.ok(config.systemInstruction);

          return {
            text: 'Here is the tailored resume bullet explanation.',
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 120,
              candidatesTokenCount: 35,
              totalTokenCount: 155,
            },
          };
        },
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      location: 'us-central1',
      sdkClient: mockSdk,
    });

    const response = await adapter.generateText({
      taskType: 'RESUME_WORDING',
      prompt: 'Refine bullet points for backend engineer',
    });

    assert.strictEqual(response.provider, 'vertex');
    assert.strictEqual(response.modelId, 'gemini-3.7-flash');
    assert.strictEqual(response.text, 'Here is the tailored resume bullet explanation.');
    assert.strictEqual(response.finishReason, 'STOP');
    assert.strictEqual(response.usage.inputTokens, 120);
    assert.strictEqual(response.usage.outputTokens, 35);
    assert.strictEqual(response.usage.totalTokens, 155);
    assert.strictEqual(response.safetyResult.status, 'ALLOWED');
    assert.strictEqual(response.metadata.location, 'us-central1');
  });

  it('5. generateText raises AiSafetyBlockedError when response is blocked by safety filters', async () => {
    const mockSdk = {
      models: {
        generateContent: async () => ({
          text: '',
          candidates: [
            {
              finishReason: 'SAFETY',
              safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH' }],
            },
          ],
        }),
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    await assert.rejects(
      async () => {
        await adapter.generateText({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Explain requirements',
        });
      },
      (err) => {
        assert.ok(err instanceof AiSafetyBlockedError);
        assert.strictEqual(err.provider, 'vertex');
        assert.strictEqual(err.details.finishReason, 'SAFETY');
        return true;
      }
    );
  });

  // 3. Structured Generation
  it('6. generateStructured validates and parses JSON conforming to Zod schema', async () => {
    const ExpectedSchema = z.object({
      summary: z.string(),
      matchScore: z.number(),
      skills: z.array(z.string()),
    });

    const mockSdk = {
      models: {
        generateContent: async ({ config }) => {
          assert.strictEqual(config.responseMimeType, 'application/json');
          assert.ok(config.responseSchema);

          return {
            text: JSON.stringify({
              summary: 'Strong candidate for cloud distributed systems',
              matchScore: 92,
              skills: ['Go', 'PostgreSQL', 'Docker'],
            }),
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25, totalTokenCount: 75 },
          };
        },
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    const response = await adapter.generateStructured({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Analyze candidate fit',
      responseSchema: ExpectedSchema,
    });

    assert.strictEqual(response.provider, 'vertex');
    assert.strictEqual(response.data.summary, 'Strong candidate for cloud distributed systems');
    assert.strictEqual(response.data.matchScore, 92);
    assert.deepStrictEqual(response.data.skills, ['Go', 'PostgreSQL', 'Docker']);
  });

  it('7. generateStructured throws AiOutputSchemaError when response violates Zod schema', async () => {
    const StrictSchema = z.object({
      requiredField: z.string(),
      score: z.number().min(0).max(100),
    });

    const mockSdk = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({ score: 150 }), // Missing requiredField and score > 100
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
        }),
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    await assert.rejects(
      async () => {
        await adapter.generateStructured({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Analyze fit',
          responseSchema: StrictSchema,
        });
      },
      (err) => {
        assert.ok(err instanceof AiOutputSchemaError);
        assert.strictEqual(err.provider, 'vertex');
        return true;
      }
    );
  });

  it('8. generateStructured throws AiOutputSchemaError on unparseable JSON text', async () => {
    const mockSdk = {
      models: {
        generateContent: async () => ({
          text: 'This is not valid JSON string { broken',
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
        }),
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    await assert.rejects(
      async () => {
        await adapter.generateStructured({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Analyze fit',
          responseSchema: z.object({ key: z.string() }),
        });
      },
      (err) => {
        assert.ok(err instanceof AiOutputSchemaError);
        assert.strictEqual(err.provider, 'vertex');
        return true;
      }
    );
  });

  // 4. Tool Loop Execution
  it('9. executeToolLoop executes multi-turn tool calling and returns final answer', async () => {
    let callCount = 0;
    const mockSdk = {
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            // Turn 1: Model calls inspect_project_evidence
            return {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        functionCall: {
                          name: 'inspect_project_evidence',
                          args: { projectId: 'p-123', requirementKeys: ['go-lang'] },
                        },
                      },
                    ],
                  },
                  finishReason: 'STOP',
                },
              ],
            };
          }

          // Turn 2: Model returns final text summary
          return {
            text: 'Project p-123 exhibits deep verified Go microservice evidence.',
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    { text: 'Project p-123 exhibits deep verified Go microservice evidence.' },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 200,
              candidatesTokenCount: 50,
              totalTokenCount: 250,
            },
          };
        },
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    const toolExecutor = async (name, args) => {
      assert.strictEqual(name, 'inspect_project_evidence');
      assert.strictEqual(args.projectId, 'p-123');
      return { verifiedSkills: ['Go', 'gRPC'], densityScore: 88 };
    };

    const result = await adapter.executeToolLoop({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Inspect project evidence and explain fit',
      tools: [{ name: 'inspect_project_evidence', description: 'Inspects project evidence' }],
      toolExecutor,
    });

    assert.strictEqual(result.rounds, 2);
    assert.strictEqual(result.toolCallsExecuted.length, 1);
    assert.strictEqual(result.toolCallsExecuted[0].name, 'inspect_project_evidence');
    assert.strictEqual(result.finalResponse.provider, 'vertex');
    assert.strictEqual(
      result.finalResponse.text,
      'Project p-123 exhibits deep verified Go microservice evidence.'
    );
  });

  it('10. executeToolLoop rejects unapproved tools not in APPROVED_GEMINI_TOOLS catalog', async () => {
    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: {},
    });

    await assert.rejects(
      async () => {
        await adapter.executeToolLoop({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Run forbidden tool',
          tools: [{ name: 'delete_database_table', description: 'Destructive tool' }],
          toolExecutor: async () => {},
        });
      },
      (err) => {
        assert.ok(err instanceof AiInvalidRequestError);
        assert.match(err.message, /not in the approved Gemini tool catalog/i);
        return true;
      }
    );
  });

  it('11. executeToolLoop halts with AiToolLoopExhaustedError when loop exceeds 3 turns', async () => {
    const mockSdk = {
      models: {
        generateContent: async () => ({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'get_candidate_profile',
                      args: {},
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        }),
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    await assert.rejects(
      async () => {
        await adapter.executeToolLoop({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Loop indefinitely',
          tools: [{ name: 'get_candidate_profile' }],
          toolExecutor: async () => ({ status: 'ok' }),
        });
      },
      (err) => {
        assert.ok(err instanceof AiToolLoopExhaustedError);
        assert.strictEqual(err.provider, 'vertex');
        assert.strictEqual(err.details.rounds, 3);
        return true;
      }
    );
  });

  // 5. Retry and Model Fallback
  it('12. generateText retries on 429 and falls back to secondary model on primary exhaustion', async () => {
    let callAttempts = 0;
    const mockSdk = {
      models: {
        generateContent: async ({ model }) => {
          callAttempts++;
          if (model === 'gemini-3.7-flash') {
            const err = new Error('Resource exhausted / Quota exceeded');
            err.status = 429;
            throw err;
          }
          if (model === 'gemini-2.5-flash') {
            return {
              text: 'Recovered using fallback model gemini-2.5-flash',
              candidates: [{ finishReason: 'STOP' }],
              usageMetadata: {
                promptTokenCount: 40,
                candidatesTokenCount: 15,
                totalTokenCount: 55,
              },
            };
          }
          throw new Error('Unexpected model');
        },
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    const response = await adapter.generateText({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Explain requirements with fallback',
    });

    assert.strictEqual(response.provider, 'vertex');
    assert.strictEqual(response.modelId, 'gemini-2.5-flash');
    assert.strictEqual(response.text, 'Recovered using fallback model gemini-2.5-flash');
    assert.ok(callAttempts >= 2);
  });

  it('13. generateText retries transient 503 Service Unavailable and succeeds on attempt 2 without model switch', async () => {
    let callAttempts = 0;
    const mockSdk = {
      models: {
        generateContent: async () => {
          callAttempts++;
          if (callAttempts === 1) {
            const err = new Error('Service Unavailable');
            err.status = 503;
            throw err;
          }
          return {
            text: 'Succeeded on retry attempt 2',
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, totalTokenCount: 40 },
          };
        },
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    const response = await adapter.generateText({
      taskType: 'JOB_EXPLANATION',
      prompt: 'Test transient 503 recovery',
    });

    assert.strictEqual(response.provider, 'vertex');
    assert.strictEqual(response.modelId, 'gemini-3.6-flash');
    assert.strictEqual(response.text, 'Succeeded on retry attempt 2');
    assert.strictEqual(callAttempts, 2);
  });

  it('14. generateText throws AiTimeoutError on timeout/abort signal', async () => {
    const mockSdk = {
      models: {
        generateContent: async () => {
          const err = new Error('The operation was aborted due to timeout');
          err.name = 'AbortError';
          throw err;
        },
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    await assert.rejects(
      async () => {
        await adapter.generateText({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Timeout request',
        });
      },
      (err) => {
        assert.ok(err instanceof AiTimeoutError);
        assert.strictEqual(err.provider, 'vertex');
        return true;
      }
    );
  });

  it('15. generateText throws AiRateLimitedError when both primary and fallback models fail with 429', async () => {
    const mockSdk = {
      models: {
        generateContent: async () => {
          const err = new Error('Resource exhausted quota limit reached');
          err.status = 429;
          throw err;
        },
      },
    };

    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      sdkClient: mockSdk,
    });

    await assert.rejects(
      async () => {
        await adapter.generateText({
          taskType: 'JOB_EXPLANATION',
          prompt: 'Rate limit exhaustion',
        });
      },
      (err) => {
        assert.ok(err instanceof AiRateLimitedError);
        assert.strictEqual(err.provider, 'vertex');
        return true;
      }
    );
  });

  // 6. Health Validation
  it('16. validateHealth reports healthy when project or client is configured', async () => {
    const adapter = new GeminiVertexAdapter({
      project: 'test-gcp-project',
      location: 'us-central1',
      sdkClient: {},
    });

    const health = await adapter.validateHealth();
    assert.strictEqual(health.healthy, true);
    assert.strictEqual(health.details.provider, 'vertex');
    assert.strictEqual(health.details.location, 'us-central1');
    assert.ok(health.details.defaultModel);
  });

  it('17. validateHealth reports unhealthy when project and client are missing', async () => {
    const adapter = new GeminiVertexAdapter({
      project: '',
      sdkClient: null,
    });

    const health = await adapter.validateHealth();
    assert.strictEqual(health.healthy, false);
    assert.match(health.details.message, /GOOGLE_CLOUD_PROJECT is not configured/i);
  });
});

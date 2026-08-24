/**
 * @file Google Cloud Vertex AI Gemini Provider Adapter (ARCH-028 / ADR-049)
 *
 * Implements the canonical AiProvider interface for Google Cloud Vertex AI using
 * Application Default Credentials (ADC) and the unified @google/genai SDK.
 *
 * Reuses 100% of existing prompt policies, XML prompt sandboxing, Zod-to-Gemini schema
 * conversion, error normalization, and bounded tool execution (max 3 turns).
 */

import { GoogleGenAI } from '@google/genai';
import { AiProvider } from '../ai/ai-provider.interface.js';
import { defaultModelRegistry } from '../ai/model-registry.js';
import { defaultTaskPolicyRegistry } from '../ai/task-policy.js';
import { defaultMcpAuditService } from '../../services/mcp-audit.service.js';
import { logger as defaultLogger } from '../../utils/logger.js';
import { buildGeminiPromptEnvelope } from '../gemini/gemini-prompt-builder.js';
import { toGeminiResponseSchema, toGeminiTools } from '../gemini/gemini-schema-converter.js';
import { normalizeGeminiError } from '../gemini/gemini-error-normalizer.js';
import {
  AiGenerationRequestSchema,
  AiStructuredRequestSchema,
  AiToolLoopRequestSchema,
} from '../../domain/ai/ai.schemas.js';
import {
  AiInvalidRequestError,
  AiOutputSchemaError,
  AiSafetyBlockedError,
  AiToolLoopExhaustedError,
} from '../../errors/ai.errors.js';
import { APPROVED_GEMINI_TOOLS } from '../gemini/gemini-adapter.js';

export { APPROVED_GEMINI_TOOLS };

export class GeminiVertexAdapter extends AiProvider {
  /**
   * @param {object} [options={}] Configuration options
   * @param {string} [options.project] Google Cloud Project ID (defaults to process.env.GOOGLE_CLOUD_PROJECT)
   * @param {string} [options.location] Google Cloud Region (defaults to process.env.GOOGLE_CLOUD_LOCATION || 'global')
   * @param {object} [options.sdkClient] Optional pre-instantiated GoogleGenAI client (for testing)
   * @param {import('../ai/model-registry.js').ModelRegistry} [options.modelRegistry] Model catalog override
   * @param {import('../ai/task-policy.js').TaskPolicyRegistry} [options.taskPolicyRegistry] Policy catalog override
   * @param {import('../../services/mcp-audit.service.js').McpAuditService} [options.auditService] Audit service override
   * @param {import('pino').Logger} [options.logger] Logger instance override
   */
  constructor(options = {}) {
    super('vertex', 'Google Cloud Vertex AI');
    this.project =
      options.project !== undefined ? options.project : process.env.GOOGLE_CLOUD_PROJECT || '';
    this.location =
      options.location !== undefined
        ? options.location
        : process.env.GOOGLE_CLOUD_LOCATION || 'global';

    if (options.sdkClient) {
      this.sdkClient = options.sdkClient;
    } else if (this.project) {
      this.sdkClient = new GoogleGenAI({
        vertexai: true,
        project: this.project,
        location: this.location,
      });
    } else {
      this.sdkClient = null;
    }

    this.modelRegistry = options.modelRegistry || defaultModelRegistry;
    this.taskPolicyRegistry = options.taskPolicyRegistry || defaultTaskPolicyRegistry;
    this.auditService = options.auditService || defaultMcpAuditService;
    this.logger = options.logger || defaultLogger;
  }

  /**
   * Internal helper resolving model and policy for a task.
   *
   * @private
   */
  _resolveExecutionConfig(request) {
    const policy = this.taskPolicyRegistry.getPolicy(request.taskType);
    const targetModelId = request.modelId || policy.preferredModelId;
    const modelMeta = this.modelRegistry.assertProductionModel(
      targetModelId,
      policy.allowsPreviewModel
    );

    return {
      policy,
      modelMeta,
      modelId: modelMeta.modelId,
      fallbackModelId: policy.fallbackModelId,
      temperature: request.temperature !== undefined ? request.temperature : policy.temperature,
      maxOutputTokens:
        request.maxOutputTokens !== undefined ? request.maxOutputTokens : policy.maxOutputTokens,
      timeoutMs: request.timeoutMs !== undefined ? request.timeoutMs : policy.timeoutMs,
      retryLimit: policy.retryLimit,
    };
  }

  /**
   * Helper sleep for jittered exponential backoff.
   *
   * @private
   */
  async _backoff(attempt) {
    const baseDelay = 400;
    const jitter = Math.random() * 200;
    const delay = Math.min(2000, baseDelay * Math.pow(2, attempt) + jitter);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Generates free-form text or prose using configured Vertex AI model and prompt blocks.
   *
   * @param {import('../../domain/ai/ai.schemas.js').AiGenerationRequest} rawRequest
   * @param {object} [options={}]
   * @returns {Promise<import('../../domain/ai/ai.schemas.js').AiGenerationResponse>}
   */
  async generateText(rawRequest, options = {}) {
    const startTime = Date.now();
    const request = AiGenerationRequestSchema.parse(rawRequest);
    const execConfig = this._resolveExecutionConfig(request);
    const promptEnvelope = buildGeminiPromptEnvelope(request);

    const client = options.sdkClient || this.sdkClient;
    if (!client) {
      throw normalizeGeminiError(
        new Error(
          'GOOGLE_CLOUD_PROJECT is not configured and no sdkClient was provided for Vertex AI.'
        ),
        { taskType: request.taskType, provider: 'vertex' }
      );
    }

    let activeModelId = execConfig.modelId;
    let lastError = null;

    // Retry & Fallback execution loop
    for (let attempt = 0; attempt <= execConfig.retryLimit; attempt++) {
      try {
        const genConfig = {
          systemInstruction: promptEnvelope.systemInstruction,
          temperature: execConfig.temperature,
          maxOutputTokens: execConfig.maxOutputTokens,
          ...(options.configOverride || {}),
        };

        const response = await client.models.generateContent({
          model: activeModelId,
          contents: promptEnvelope.contents,
          config: genConfig,
        });

        const durationMs = Date.now() - startTime;
        const text = response?.text || '';

        // Extract usage & finish reason
        const candidate = response?.candidates?.[0];
        const finishReason = candidate?.finishReason || 'STOP';

        if (finishReason === 'SAFETY') {
          throw new AiSafetyBlockedError(
            'Vertex AI blocked generation under safety thresholds.',
            { finishReason, safetyRatings: candidate?.safetyRatings },
            'vertex'
          );
        }

        const usageMetadata = response?.usageMetadata || {};
        const inputTokens = usageMetadata.promptTokenCount || 0;
        const outputTokens = usageMetadata.candidatesTokenCount || 0;
        const totalTokens = usageMetadata.totalTokenCount || inputTokens + outputTokens;

        const result = {
          text,
          provider: 'vertex',
          modelId: activeModelId,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens,
          },
          finishReason,
          safetyResult: {
            status: finishReason === 'SAFETY' ? 'BLOCKED' : 'ALLOWED',
            ratings: candidate?.safetyRatings || undefined,
          },
          durationMs,
          metadata: {
            taskType: request.taskType,
            policyId: promptEnvelope.policyId,
            policyVersion: promptEnvelope.policyVersion,
            attempt,
            location: this.location,
          },
        };

        // Telemetry & Audit
        this.logger.info(
          {
            event: 'ai.request.completed',
            provider: 'vertex',
            model: activeModelId,
            task: request.taskType,
            policyId: promptEnvelope.policyId,
            policyVersion: promptEnvelope.policyVersion,
            durationMs,
            totalTokens,
            location: this.location,
          },
          'Vertex AI text generation completed'
        );

        if (request.context && this.auditService) {
          await this.auditService.recordEvent({
            context: request.context,
            eventType: 'ai.generation.completed',
            resourceType: 'ai_model',
            resourceId: activeModelId,
            durationMs,
            statusCode: 200,
            parameters: {
              taskType: request.taskType,
              modelId: activeModelId,
              policyId: promptEnvelope.policyId,
              policyVersion: promptEnvelope.policyVersion,
              provider: 'vertex',
            },
          });
        }

        return result;
      } catch (err) {
        lastError = normalizeGeminiError(err, {
          taskType: request.taskType,
          modelId: activeModelId,
          attempt,
          provider: 'vertex',
        });

        // If non-retryable (e.g. 401 auth, safety block, invalid request), throw immediately
        if (
          lastError.code === 'AI_AUTHENTICATION_ERROR' ||
          lastError.code === 'AI_SAFETY_BLOCKED' ||
          lastError.code === 'AI_INVALID_REQUEST'
        ) {
          throw lastError;
        }

        this.logger.warn(
          { err: lastError, attempt, modelId: activeModelId, provider: 'vertex' },
          'Vertex AI API request attempt failed; evaluating retry/fallback'
        );

        if (attempt < execConfig.retryLimit) {
          await this._backoff(attempt);
          continue;
        }

        // Trigger fallback model if available and not already using fallback
        if (activeModelId !== execConfig.fallbackModelId && execConfig.fallbackModelId) {
          this.logger.warn(
            { fromModel: activeModelId, toModel: execConfig.fallbackModelId, provider: 'vertex' },
            'Primary Vertex model exhausted retries; switching to fallback model'
          );
          activeModelId = execConfig.fallbackModelId;
          attempt = 0;
          continue;
        }
      }
    }

    throw lastError || new Error('Vertex AI generation failed.');
  }

  /**
   * Generates type-safe structured output conforming strictly to Zod or JSON Schema.
   *
   * @template T
   * @param {import('../../domain/ai/ai.schemas.js').AiStructuredRequest} rawRequest
   * @param {object} [options={}]
   * @returns {Promise<import('../../domain/ai/ai.schemas.js').AiStructuredResponse & { data: T }>}
   */
  async generateStructured(rawRequest, options = {}) {
    const request = AiStructuredRequestSchema.parse(rawRequest);
    const geminiSchema = toGeminiResponseSchema(request.responseSchema);

    const configOverride = {
      responseMimeType: 'application/json',
      responseSchema: geminiSchema,
    };

    const textResponse = await this.generateText(request, {
      ...options,
      configOverride,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(textResponse.text);
    } catch (parseErr) {
      throw new AiOutputSchemaError(
        'Vertex AI returned unparseable JSON for structured request.',
        { rawText: textResponse.text, parseError: parseErr.message },
        'vertex'
      );
    }

    // If a Zod schema was provided, run strict domain validation
    let validatedData = parsed;
    if (
      request.responseSchema &&
      typeof request.responseSchema.parse === 'function' &&
      typeof request.responseSchema.safeParse === 'function'
    ) {
      const parseResult = request.responseSchema.safeParse(parsed);
      if (!parseResult.success) {
        throw new AiOutputSchemaError(
          'Vertex AI structured output failed Zod schema contract validation.',
          { errors: parseResult.error.errors, parsed },
          'vertex'
        );
      }
      validatedData = parseResult.data;
    }

    return {
      data: validatedData,
      rawText: textResponse.text,
      provider: textResponse.provider,
      modelId: textResponse.modelId,
      usage: textResponse.usage,
      finishReason: textResponse.finishReason,
      safetyResult: textResponse.safetyResult,
      durationMs: textResponse.durationMs,
      metadata: textResponse.metadata,
    };
  }

  /**
   * Executes bounded multi-turn tool calling loop (max 3 rounds) with approved tools.
   *
   * @param {import('../../domain/ai/ai.schemas.js').AiToolLoopRequest} rawRequest
   * @param {object} [options={}]
   * @returns {Promise<import('../../domain/ai/ai.schemas.js').AiToolLoopResponse>}
   */
  async executeToolLoop(rawRequest, options = {}) {
    const startTime = Date.now();
    const request = AiToolLoopRequestSchema.parse(rawRequest);
    const execConfig = this._resolveExecutionConfig(request);

    // 1. Assert tool permissions & whitelist
    const providedTools = request.tools || [];
    for (const tool of providedTools) {
      const toolName = tool.name || tool.definition?.name;
      if (toolName && !APPROVED_GEMINI_TOOLS.includes(toolName)) {
        throw new AiInvalidRequestError(
          `Tool "${toolName}" is not in the approved Gemini tool catalog.`,
          { toolName, approvedTools: APPROVED_GEMINI_TOOLS }
        );
      }
    }

    const geminiTools = toGeminiTools(providedTools);
    const client = options.sdkClient || this.sdkClient;
    if (!client) {
      throw normalizeGeminiError(
        new Error(
          'GOOGLE_CLOUD_PROJECT is not configured and no sdkClient was provided for Vertex AI.'
        ),
        { taskType: request.taskType, provider: 'vertex' }
      );
    }

    const promptEnvelope = buildGeminiPromptEnvelope(request);
    const contents = [
      {
        role: 'user',
        parts: [{ text: promptEnvelope.contents }],
      },
    ];

    const toolCallsExecuted = [];
    const maxRounds = Math.min(3, request.maxRounds || 3);
    let rounds = 0;
    let finalResponse = null;
    let activeModelId = execConfig.modelId;

    while (rounds < maxRounds) {
      rounds++;
      const roundStart = Date.now();

      // Execute content generation with retry/fallback
      let response = null;
      let lastLoopError = null;

      for (let attempt = 0; attempt <= execConfig.retryLimit; attempt++) {
        try {
          response = await client.models.generateContent({
            model: activeModelId,
            contents,
            config: {
              systemInstruction: promptEnvelope.systemInstruction,
              temperature: execConfig.temperature,
              tools: geminiTools,
            },
          });
          break;
        } catch (err) {
          lastLoopError = normalizeGeminiError(err, {
            taskType: request.taskType,
            modelId: activeModelId,
            attempt,
            provider: 'vertex',
          });

          if (
            lastLoopError.code === 'AI_AUTHENTICATION_ERROR' ||
            lastLoopError.code === 'AI_SAFETY_BLOCKED' ||
            lastLoopError.code === 'AI_INVALID_REQUEST'
          ) {
            throw lastLoopError;
          }

          if (attempt < execConfig.retryLimit) {
            await this._backoff(attempt);
            continue;
          }

          if (activeModelId !== execConfig.fallbackModelId && execConfig.fallbackModelId) {
            this.logger.warn(
              { fromModel: activeModelId, toModel: execConfig.fallbackModelId, provider: 'vertex' },
              'Primary Vertex model exhausted retries in tool loop; switching to fallback model'
            );
            activeModelId = execConfig.fallbackModelId;
            attempt = 0;
            continue;
          }

          throw lastLoopError;
        }
      }

      const candidate = response?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCalls = parts.filter((p) => Boolean(p.functionCall)).map((p) => p.functionCall);

      // If no function calls, Vertex returned its final answer
      if (functionCalls.length === 0) {
        finalResponse = {
          text: response?.text || '',
          provider: 'vertex',
          modelId: activeModelId,
          usage: {
            inputTokens: response?.usageMetadata?.promptTokenCount || 0,
            outputTokens: response?.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: response?.usageMetadata?.totalTokenCount || 0,
          },
          finishReason: candidate?.finishReason || 'STOP',
          safetyResult: { status: 'ALLOWED' },
          durationMs: Date.now() - roundStart,
          metadata: {
            taskType: request.taskType,
            policyId: promptEnvelope.policyId,
            policyVersion: promptEnvelope.policyVersion,
            location: this.location,
          },
        };
        break;
      }

      // Execute each function call using the provided toolExecutor
      const functionResponseParts = [];
      for (const fc of functionCalls) {
        const callStart = Date.now();
        let toolResult = null;
        let isError = false;

        this.logger.info(
          { event: 'ai.tool_call.started', toolName: fc.name, round: rounds, provider: 'vertex' },
          'Executing Vertex AI tool call'
        );

        try {
          if (typeof request.toolExecutor !== 'function') {
            throw new Error(`No toolExecutor function provided to execute tool "${fc.name}"`);
          }

          toolResult = await request.toolExecutor(fc.name, fc.args || {}, request.context);
        } catch (toolErr) {
          isError = true;
          toolResult = { error: toolErr.message || 'Tool execution failed' };
        }

        const callDuration = Date.now() - callStart;
        toolCallsExecuted.push({
          round: rounds,
          name: fc.name,
          args: fc.args,
          durationMs: callDuration,
          isError,
        });

        functionResponseParts.push({
          functionResponse: {
            name: fc.name,
            response: { output: toolResult },
          },
        });
      }

      // Append assistant's turn with tool calls and user's turn with tool results
      contents.push(candidate.content);
      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });
    }

    if (!finalResponse) {
      throw new AiToolLoopExhaustedError(
        `Vertex AI tool execution exceeded maximum turn limit (${maxRounds} rounds).`,
        { rounds, toolCallsExecuted },
        'vertex'
      );
    }

    return {
      finalResponse,
      rounds,
      toolCallsExecuted,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Verifies provider connectivity and credential status with a minimal synthetic check.
   *
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: any }>}
   */
  async validateHealth() {
    const start = Date.now();
    if (!this.project && !this.sdkClient) {
      return {
        healthy: false,
        latencyMs: 0,
        details: { message: 'GOOGLE_CLOUD_PROJECT is not configured.' },
      };
    }

    return {
      healthy: true,
      latencyMs: Date.now() - start,
      details: {
        provider: 'vertex',
        project: this.project ? '[CONFIGURED]' : '[MOCKED]',
        location: this.location,
        defaultModel: this.modelRegistry.getDefaultModel().modelId,
      },
    };
  }
}

export const defaultVertexAdapter = new GeminiVertexAdapter();
export default GeminiVertexAdapter;

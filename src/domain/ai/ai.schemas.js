/**
 * @file Provider-Neutral AI Domain Schemas (ARCH-026 / ADR-047)
 *
 * Defines Zod schemas and validation contracts for AI providers, task policies,
 * model registries, generation envelopes, structured outputs, and tool loops.
 */

import { z } from 'zod';

/**
 * Supported AI Provider Identifiers.
 */
export const AiProviderIdSchema = z.enum(['gemini', 'claude', 'openai', 'mock']);

/**
 * Model Release Lifecycle Classification.
 */
export const AiStabilitySchema = z.enum(['STABLE', 'PREVIEW', 'DEPRECATED']);

/**
 * Standardized AI Safety Classification Verdict.
 */
export const AiSafetyStatusSchema = z.enum(['ALLOWED', 'BLOCKED', 'REVIEW']);

/**
 * Canonical AI Career Task Classifications.
 */
export const AiTaskTypeSchema = z.enum([
  'RESUME_WORDING',
  'COVER_LETTER',
  'JOB_EXPLANATION',
  'CAREER_COACHING',
  'PROJECT_CASE_STUDY',
  'INTERVIEW_PREPARATION',
  'JOB_PARSER_FALLBACK',
  'TITLE_NORMALIZATION',
  'SYNTHETIC_HEALTH_CHECK',
]);

/**
 * Model Registry Entry Schema.
 */
export const ModelMetadataSchema = z.object({
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  provider: AiProviderIdSchema,
  stability: AiStabilitySchema,
  status: z.enum(['ACTIVE', 'DEPRECATED', 'SUNSET']),
  capabilities: z.array(z.string()).default([]),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  supportsStructuredOutput: z.boolean().default(true),
  supportsFunctionCalling: z.boolean().default(true),
  supportsCaching: z.boolean().default(false),
  supportsThinking: z.boolean().default(false),
  isProductionDefault: z.boolean().default(false),
  deprecatedAt: z.string().nullable().optional(),
});

/**
 * Task Policy Configuration Schema.
 */
export const TaskPolicySchema = z.object({
  taskType: AiTaskTypeSchema,
  preferredModelId: z.string().min(1),
  fallbackModelId: z.string().min(1),
  maxInputTokens: z.number().int().positive().default(8000),
  maxOutputTokens: z.number().int().positive().default(2048),
  temperature: z.number().min(0).max(2).default(0.2),
  timeoutMs: z.number().int().positive().default(10000),
  retryLimit: z.number().int().nonnegative().max(2).default(2),
  requiresStructuredOutput: z.boolean().default(false),
  allowsTools: z.boolean().default(false),
  allowsPreviewModel: z.boolean().default(false),
  costTier: z.enum(['LOW', 'STANDARD', 'PREMIUM']).default('STANDARD'),
});

/**
 * Token Accounting and Cost Usage Metadata.
 */
export const AiUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  thinkingTokens: z.number().int().nonnegative().optional(),
  cachedTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().default(0),
  estimatedCostUsd: z.number().nonnegative().optional(),
});

/**
 * Normalized AI Safety Evaluation Result.
 */
export const AiSafetyResultSchema = z.object({
  status: AiSafetyStatusSchema.default('ALLOWED'),
  blockedCategory: z.string().nullable().optional(),
  ratings: z.record(z.any()).optional(),
  details: z.string().optional(),
});

/**
 * Tool Invocation Call Schema.
 */
export const AiToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.any()).default({}),
});

/**
 * Tool Execution Result Schema.
 */
export const AiToolResultSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  result: z.any(),
  isError: z.boolean().default(false),
});

/**
 * Canonical AI Generation Request Schema (Text & Prose).
 */
export const AiGenerationRequestSchema = z.object({
  taskType: AiTaskTypeSchema,
  prompt: z.string().min(1),
  systemInstruction: z.string().optional(),
  candidateFacts: z.record(z.any()).optional(),
  untrustedContent: z.record(z.any()).optional(),
  modelId: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  abortSignal: z.any().optional(),
  context: z.any().optional(), // McpRequestContext
});

/**
 * Canonical AI Generation Response Schema.
 */
export const AiGenerationResponseSchema = z.object({
  text: z.string(),
  provider: AiProviderIdSchema,
  modelId: z.string(),
  usage: AiUsageSchema.default({}),
  finishReason: z.string().default('STOP'),
  safetyResult: AiSafetyResultSchema.default({}),
  durationMs: z.number().nonnegative().default(0),
  metadata: z.record(z.any()).optional(),
});

/**
 * Structured Generation Request Schema.
 */
export const AiStructuredRequestSchema = AiGenerationRequestSchema.extend({
  responseSchema: z.any(),
  schemaName: z.string().optional(),
});

/**
 * Structured Generation Response Schema.
 */
export const AiStructuredResponseSchema = z.object({
  data: z.any(),
  rawText: z.string().optional(),
  provider: AiProviderIdSchema,
  modelId: z.string(),
  usage: AiUsageSchema.default({}),
  finishReason: z.string().default('STOP'),
  safetyResult: AiSafetyResultSchema.default({}),
  durationMs: z.number().nonnegative().default(0),
  metadata: z.record(z.any()).optional(),
});

/**
 * Multi-Turn Tool Loop Request Schema.
 */
export const AiToolLoopRequestSchema = AiGenerationRequestSchema.extend({
  tools: z.array(z.any()).default([]),
  toolExecutor: z.function().optional(),
  maxRounds: z.number().int().positive().max(3).default(3),
});

/**
 * Multi-Turn Tool Loop Response Schema.
 */
export const AiToolLoopResponseSchema = z.object({
  finalResponse: z.union([AiGenerationResponseSchema, AiStructuredResponseSchema]),
  rounds: z.number().int().positive(),
  toolCallsExecuted: z
    .array(
      z.object({
        round: z.number().int().positive(),
        name: z.string(),
        args: z.any(),
        durationMs: z.number().nonnegative(),
        isError: z.boolean(),
      })
    )
    .default([]),
  totalDurationMs: z.number().nonnegative(),
});

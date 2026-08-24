/**
 * @file Integration Tests for Gemini Provider Adapter (P8-001 / ARCH-026)
 *
 * Verifies:
 * 1. End-to-end tool calling integration with real MCP tools (get_candidate_profile, analyze_job_fit).
 * 2. Multi-turn execution against Fastify / Remote MCP server with McpRequestContext preservation.
 * 3. Structured output generation with real domain schemas.
 * 4. Safe live Gemini API test (executes only when GEMINI_API_KEY is available; skips safely otherwise).
 */

import '../../src/config/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, skills, candidateSkills } from '../../src/db/schema.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { GeminiProviderAdapter } from '../../src/clients/gemini/gemini-adapter.js';

describe('Gemini Provider Adapter Integration Tests (P8-001)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  let tenantA;
  let userA;
  let candidateA;
  let mcpServer;
  let mockContext;

  before(async () => {
    // 1. Provision Test Tenant & User
    const [tA] = await db
      .insert(tenants)
      .values({
        name: `Gemini Integration Tenant ${testRunId}`,
        slug: `gemini-test-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    tenantA = tA;

    const [uA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `gemini-owner-${testRunId}@example.com`,
        displayName: 'Alice Gemini Test',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();
    userA = uA;

    // 2. Provision Candidate & Skill
    const [cand] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Alice Cloud Architect',
        headline: 'Lead Cloud Architect',
        summary: 'Expert in Go, Kubernetes, and PostgreSQL.',
        canonicalEmail: userA.email,
        status: 'ACTIVE',
      })
      .returning();
    candidateA = cand;

    let [skillGo] = await db.select().from(skills).where(eq(skills.slug, 'go')).limit(1);
    if (!skillGo) {
      [skillGo] = await db
        .insert(skills)
        .values({ slug: 'go', name: 'Go', category: 'LANGUAGE' })
        .returning();
    }

    await db.insert(candidateSkills).values({
      tenantId: tenantA.id,
      candidateId: candidateA.id,
      skillId: skillGo.id,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.95,
    });

    // 3. Initialize MCP Server
    mcpServer = createCareerMcpServer({ deps: { db } });
    await mcpServer.start();

    mockContext = {
      requestId: crypto.randomUUID(),
      tenantId: tenantA.id,
      userId: userA.id,
      role: 'OWNER',
      tokenScopes: ['career:read', 'career:write'],
      authMethod: 'MCP_API_TOKEN',
      clientInfo: { protocolVersion: '2026-07-28' },
    };
  });

  after(async () => {
    try {
      if (mcpServer) await mcpServer.close();
      if (tenantA?.id) {
        await db
          .delete(tenants)
          .where(eq(tenants.id, tenantA.id))
          .catch(() => {});
      }
    } finally {
      await closeDatabase();

      // Clean up any remaining idle keep-alive sockets (e.g. fetch / HTTPS agent keep-alive)
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
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Tool Calling Integration with Real MCP Career Tools
  // ---------------------------------------------------------------------------
  it('1. executeToolLoop successfully invokes real MCP tools via toolExecutor', async () => {
    let callCount = 0;
    const mockSdk = {
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            // Gemini decides to invoke get_candidate_profile
            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: 'get_candidate_profile',
                          args: { candidateId: candidateA.id },
                        },
                      },
                    ],
                  },
                },
              ],
            };
          }
          // Turn 2: Gemini returns formatted response
          return {
            text: 'Alice is a Lead Cloud Architect with verified Go expertise.',
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 300,
              candidatesTokenCount: 40,
              totalTokenCount: 340,
            },
          };
        },
      },
    };

    const adapter = new GeminiProviderAdapter({ sdkClient: mockSdk });

    // Define tool executor bridging into MCP tools
    const toolExecutor = async (name, args, context) => {
      const registered = mcpServer.registeredTools.get(name);
      assert.ok(registered, `Tool ${name} must be registered on MCP server`);
      return await registered.handler(context, args);
    };

    const tools = mcpServer
      .getRegisteredTools()
      .filter((t) =>
        [
          'get_candidate_profile',
          'list_verified_skills',
          'inspect_project_evidence',
          'analyze_job_fit',
          'recommend_portfolio_projects',
        ].includes(t.name)
      );

    const result = await adapter.executeToolLoop({
      taskType: 'CAREER_COACHING',
      prompt: 'Summarize candidate profile for Alice',
      tools,
      toolExecutor,
      context: mockContext,
    });

    assert.strictEqual(result.rounds, 2);
    assert.strictEqual(result.toolCallsExecuted.length, 1);
    assert.strictEqual(result.toolCallsExecuted[0].name, 'get_candidate_profile');
    assert.strictEqual(result.toolCallsExecuted[0].isError, false);
    assert.ok(result.finalResponse.text.includes('Alice is a Lead Cloud Architect'));
  });

  // ---------------------------------------------------------------------------
  // 2. Structured Output with Domain Schema
  // ---------------------------------------------------------------------------
  it('2. generateStructured parses structured career advice envelope', async () => {
    const AdviceSchema = z.object({
      roleSuitability: z.enum(['STRONG_FIT', 'MODERATE_FIT', 'LOW_FIT']),
      primaryStrengths: z.array(z.string()),
      recommendedNextSteps: z.array(z.string()),
    });

    const mockSdk = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            roleSuitability: 'STRONG_FIT',
            primaryStrengths: ['Distributed Systems in Go', 'PostgreSQL Schema Design'],
            recommendedNextSteps: ['Highlight consensus protocol experience'],
          }),
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 250, candidatesTokenCount: 60, totalTokenCount: 310 },
        }),
      },
    };

    const adapter = new GeminiProviderAdapter({ sdkClient: mockSdk });

    const result = await adapter.generateStructured({
      taskType: 'CAREER_COACHING',
      prompt: 'Evaluate candidate strengths',
      responseSchema: AdviceSchema,
      context: mockContext,
    });

    assert.strictEqual(result.data.roleSuitability, 'STRONG_FIT');
    assert.strictEqual(result.data.primaryStrengths.length, 2);
    assert.strictEqual(result.provider, 'gemini');
  });

  // ---------------------------------------------------------------------------
  // 3. Live Gemini API Synthetic Test Suite
  // ---------------------------------------------------------------------------
  it('3. Live Gemini API Synthetic Verification (executes when GEMINI_API_KEY is available)', async (t) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('AIzaSy_placeholder')) {
      t.skip('Skipping live Gemini API test: GEMINI_API_KEY is not configured.');
      return;
    }

    const liveAdapter = new GeminiProviderAdapter({ apiKey });

    // 1. Model Verification: Must resolve to gemini-3.7-flash production default
    const defaultModel = liveAdapter.modelRegistry.getDefaultModel();
    assert.strictEqual(
      defaultModel.modelId,
      'gemini-3.7-flash',
      'Production model must be gemini-3.7-flash'
    );
    assert.strictEqual(defaultModel.stability, 'STABLE');

    // 2. Live Text Generation (Synthetic non-sensitive prompt)
    const textRes = await liveAdapter.generateText({
      taskType: 'RESUME_WORDING',
      prompt: 'Respond with exactly: PONG',
    });

    assert.ok(textRes.text, 'generateText must return non-empty text');
    assert.strictEqual(textRes.provider, 'gemini');
    assert.ok(
      ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'].includes(textRes.modelId),
      'Model used must be valid configured model'
    );
    assert.ok(textRes.usage.totalTokens > 0, 'usage.totalTokens must be positive');
    assert.strictEqual(textRes.safetyResult.status, 'ALLOWED');
    assert.strictEqual(
      textRes.text.includes(apiKey),
      false,
      'API key must not appear in text output'
    );

    // 3. Live Structured Output Generation (Synthetic Schema)
    const SyntheticStatusSchema = z.object({
      status: z.string(),
      message: z.string(),
    });

    const structRes = await liveAdapter.generateStructured({
      taskType: 'RESUME_WORDING',
      prompt:
        'Return a JSON object conforming to the schema with status="ok" and message="synthetic Gemini connectivity test".',
      responseSchema: SyntheticStatusSchema,
    });

    assert.ok(structRes.data, 'generateStructured must return parsed data');
    assert.strictEqual(typeof structRes.data.status, 'string');
    assert.strictEqual(typeof structRes.data.message, 'string');
    assert.strictEqual(structRes.provider, 'gemini');
    assert.ok(
      ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'].includes(structRes.modelId),
      'Model used must be valid configured model'
    );
    assert.ok(structRes.usage.totalTokens > 0, 'usage.totalTokens must be positive');
    assert.strictEqual(
      structRes.rawText.includes(apiKey),
      false,
      'API key must not appear in raw structured text'
    );

    // 4. Live Tool Calling Loop with Approved Read Tool & Context Preservation
    let contextReceivedByTool = null;
    const syntheticToolExecutor = async (name, args, context) => {
      assert.strictEqual(name, 'get_candidate_profile');
      contextReceivedByTool = context;
      return {
        candidateId: args.candidateId,
        displayName: 'Synthetic Candidate',
        verifiedSkills: ['TypeScript', 'Cloud Systems'],
      };
    };

    const liveToolRes = await liveAdapter.executeToolLoop({
      taskType: 'CAREER_COACHING',
      prompt:
        'Please call get_candidate_profile for candidateId "synth-001" and summarize their skills in one sentence.',
      tools: [
        {
          name: 'get_candidate_profile',
          description: 'Retrieves candidate profile for a given candidateId',
          inputSchema: z.object({ candidateId: z.string() }),
        },
      ],
      toolExecutor: syntheticToolExecutor,
      context: mockContext,
      maxRounds: 3,
    });

    assert.ok(liveToolRes.rounds <= 3, 'Tool loop depth must be <= 3');
    assert.ok(
      liveToolRes.toolCallsExecuted.length >= 1,
      'Gemini must execute at least one tool call'
    );
    assert.strictEqual(liveToolRes.toolCallsExecuted[0].name, 'get_candidate_profile');
    assert.strictEqual(liveToolRes.toolCallsExecuted[0].isError, false);
    assert.ok(contextReceivedByTool, 'McpRequestContext must be passed to tool executor');
    assert.strictEqual(
      contextReceivedByTool.tenantId,
      mockContext.tenantId,
      'McpRequestContext.tenantId must be preserved'
    );
    assert.strictEqual(
      contextReceivedByTool.userId,
      mockContext.userId,
      'McpRequestContext.userId must be preserved'
    );
    assert.ok(
      liveToolRes.finalResponse.text,
      'Final response text must be generated after tool turn'
    );
    assert.ok(
      ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'].includes(
        liveToolRes.finalResponse.modelId
      ),
      'Model used in tool loop must be valid configured model'
    );
    assert.strictEqual(
      liveToolRes.finalResponse.text.includes(apiKey),
      false,
      'API key must not appear in final tool response'
    );
  });
});

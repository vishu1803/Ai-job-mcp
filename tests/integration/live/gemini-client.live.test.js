/**
 * @file Live External Integration Tests for Google Gemini Provider (P8-001 / P8-002 / ARCH-026)
 *
 * Dedicated live verification suite targeting the real Google Gemini Developer API.
 * Executed ONLY via explicit command: `npm run test:live`
 *
 * Key Constraints:
 * 1. Requires a valid GEMINI_API_KEY environment variable (skips cleanly if absent or placeholder).
 * 2. Minimal request budget: <= 4 total real API requests to avoid rate limits or quota depletion.
 * 3. Primary model: gemini-3.7-flash (production default).
 * 4. Verifies:
 *    - Real authentication and model resolution
 *    - Real text generation (generateText)
 *    - Real structured output generation (generateStructured)
 *    - Single real tool-calling loop (executeToolLoop) with McpRequestContext preservation
 * 5. Uses synthetic, non-sensitive prompt payloads only.
 * 6. Clean database and keep-alive socket teardown.
 */

import '../../../src/config/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../../src/db/index.js';
import { tenants, users, candidates, skills, candidateSkills } from '../../../src/db/schema.js';
import { createCareerMcpServer } from '../../../src/mcp/server.js';
import { GeminiProviderAdapter } from '../../../src/clients/gemini/gemini-adapter.js';

describe('Live Google Gemini External API Verification Suite', () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isLiveConfigured = Boolean(apiKey && !apiKey.startsWith('AIzaSy_placeholder'));
  const testRunId = crypto.randomBytes(4).toString('hex');

  let tenantA;
  let userA;
  let candidateA;
  let mcpServer;
  let mockContext;

  before(async () => {
    if (!isLiveConfigured) return;

    // 1. Provision Test Tenant & User in PostgreSQL
    const [tA] = await db
      .insert(tenants)
      .values({
        name: `Gemini Live Tenant ${testRunId}`,
        slug: `gemini-live-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    tenantA = tA;

    const [uA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `gemini-live-${testRunId}@example.com`,
        displayName: 'Alice Gemini Live',
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

      // Clean up idle keep-alive sockets to guarantee immediate process exit
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
  // 1. Live Authentication & Default Model Resolution (Request 1)
  // ---------------------------------------------------------------------------
  it('1. Live Authentication & GA Model Resolution: gemini-3.7-flash', async (t) => {
    if (!isLiveConfigured) {
      t.skip(
        'Skipping live Gemini verification: GEMINI_API_KEY is not configured or is a placeholder.'
      );
      return;
    }

    const liveAdapter = new GeminiProviderAdapter({ apiKey });
    const defaultModel = liveAdapter.modelRegistry.getDefaultModel();

    assert.strictEqual(
      defaultModel.modelId,
      'gemini-3.7-flash',
      'Production model must be gemini-3.7-flash'
    );
    assert.strictEqual(defaultModel.stability, 'STABLE');

    // Live Text Generation (Synthetic non-sensitive ping)
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
  });

  // ---------------------------------------------------------------------------
  // 2. Live Structured Output Generation with Zod Schema (Request 2)
  // ---------------------------------------------------------------------------
  it('2. Live Structured Output: Enforces Zod responseSchema on Gemini response', async (t) => {
    if (!isLiveConfigured) {
      t.skip(
        'Skipping live Gemini verification: GEMINI_API_KEY is not configured or is a placeholder.'
      );
      return;
    }

    const liveAdapter = new GeminiProviderAdapter({ apiKey });

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
  });

  // ---------------------------------------------------------------------------
  // 3. Live Tool Calling Loop with Approved Career Read Tool (Request 3)
  // ---------------------------------------------------------------------------
  it('3. Live Tool Calling Loop: Invokes get_candidate_profile with McpRequestContext preservation', async (t) => {
    if (!isLiveConfigured) {
      t.skip(
        'Skipping live Gemini verification: GEMINI_API_KEY is not configured or is a placeholder.'
      );
      return;
    }

    const liveAdapter = new GeminiProviderAdapter({ apiKey });

    let contextReceivedByTool = null;
    const syntheticToolExecutor = async (name, args, context) => {
      assert.strictEqual(name, 'get_candidate_profile');
      contextReceivedByTool = context;
      return {
        candidateId: args.candidateId,
        displayName: 'Alice Cloud Architect',
        verifiedSkills: ['Go', 'PostgreSQL'],
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

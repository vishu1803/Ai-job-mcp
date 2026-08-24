/**
 * @file Dedicated Live Google Cloud Vertex AI Integration Tests (P8-004)
 *
 * Runs strictly isolated under `npm run test:live:vertex` using real Google Cloud
 * Application Default Credentials (ADC) against live Google Cloud Vertex AI endpoints.
 *
 * Invariant: Minimal synthetic workload (max 3-5 real requests).
 * Gracefully skips if GOOGLE_CLOUD_PROJECT or ADC is not configured, or if ADC token expired.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { GeminiVertexAdapter } from '../../../src/clients/vertex/vertex-adapter.js';

// Load local environment files if present (.env.local has priority)
dotenv.config();
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

function hasAdcConfigured() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const winPath = path.join(appData, 'gcloud', 'application_default_credentials.json');
    return fs.existsSync(winPath);
  }
  const posixPath = path.join(
    os.homedir(),
    '.config',
    'gcloud',
    'application_default_credentials.json'
  );
  return fs.existsSync(posixPath);
}

const hasGcpProject = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
const hasAdc = hasAdcConfigured();
const isLiveVertexReady = hasGcpProject && hasAdc;

function handleLiveAuthError(t, err) {
  if (
    err?.code === 'AI_AUTHENTICATION_ERROR' ||
    err?.message?.includes('invalid_grant') ||
    err?.message?.includes('authentication') ||
    err?.message?.includes('credentials')
  ) {
    t.skip(
      `Skipping live Vertex AI test: ADC credentials require renewal (${err.message || 'invalid_grant'}). Run "gcloud auth application-default login".`
    );
    return true;
  }
  return false;
}

describe('Live Google Cloud Vertex AI Integration Tests (P8-004)', () => {
  it('1. validateHealth reports healthy connectivity under Vertex AI ADC', async (t) => {
    if (!isLiveVertexReady) {
      t.skip('Skipping live Vertex AI test: GOOGLE_CLOUD_PROJECT or ADC is not configured.');
      return;
    }

    const adapter = new GeminiVertexAdapter({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });

    const health = await adapter.validateHealth();
    assert.strictEqual(health.healthy, true);
    assert.strictEqual(health.details.provider, 'vertex');
    assert.ok(health.details.defaultModel);
  });

  it('2. generateText generates live natural language response from Vertex AI', async (t) => {
    if (!isLiveVertexReady) {
      t.skip('Skipping live Vertex AI test: GOOGLE_CLOUD_PROJECT or ADC is not configured.');
      return;
    }

    const adapter = new GeminiVertexAdapter({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });

    try {
      const response = await adapter.generateText({
        taskType: 'JOB_EXPLANATION',
        prompt: 'Reply with exactly: VERTEX_LIVE_OK',
      });

      assert.strictEqual(response.provider, 'vertex');
      assert.ok(response.text);
      assert.strictEqual(response.finishReason, 'STOP');
      assert.ok(response.usage.totalTokens > 0);
    } catch (err) {
      if (handleLiveAuthError(t, err)) return;
      throw err;
    }
  });

  it('3. generateStructured generates live validated JSON conforming to Zod schema', async (t) => {
    if (!isLiveVertexReady) {
      t.skip('Skipping live Vertex AI test: GOOGLE_CLOUD_PROJECT or ADC is not configured.');
      return;
    }

    const adapter = new GeminiVertexAdapter({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });

    const CandidateFitSchema = z.object({
      fitSummary: z.string(),
      estimatedMatchPercent: z.number().min(0).max(100),
      topVerifiedSkills: z.array(z.string()).min(1),
    });

    try {
      const response = await adapter.generateStructured({
        taskType: 'JOB_EXPLANATION',
        prompt:
          'The candidate has verified Go, PostgreSQL, and Docker experience. Summarize their fit for a Senior Backend Role.',
        responseSchema: CandidateFitSchema,
      });

      assert.strictEqual(response.provider, 'vertex');
      assert.ok(response.data.fitSummary.length > 5);
      assert.ok(response.data.estimatedMatchPercent >= 0);
      assert.ok(response.data.topVerifiedSkills.length >= 1);
    } catch (err) {
      if (handleLiveAuthError(t, err)) return;
      throw err;
    }
  });

  it('4. executeToolLoop executes single tool round-trip against Vertex AI', async (t) => {
    if (!isLiveVertexReady) {
      t.skip('Skipping live Vertex AI test: GOOGLE_CLOUD_PROJECT or ADC is not configured.');
      return;
    }

    const adapter = new GeminiVertexAdapter({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });

    let toolExecuted = false;
    const toolExecutor = async (name, args) => {
      if (name === 'inspect_project_evidence') {
        toolExecuted = true;
        return {
          projectId: args.projectId,
          evidenceCount: 3,
          skills: ['Go', 'PostgreSQL'],
          densityScore: 92,
        };
      }
      return { error: 'Unknown tool' };
    };

    try {
      const result = await adapter.executeToolLoop({
        taskType: 'JOB_EXPLANATION',
        prompt:
          'Inspect the candidate project evidence for project "p-golden-101" and state whether Go is verified.',
        tools: [
          {
            name: 'inspect_project_evidence',
            description: 'Inspects project repository evidence',
            parameters: {
              type: 'object',
              properties: {
                projectId: { type: 'string' },
              },
              required: ['projectId'],
            },
          },
        ],
        toolExecutor,
      });

      assert.ok(toolExecuted, 'Tool executor must be called by Vertex AI');
      assert.strictEqual(result.finalResponse.provider, 'vertex');
      assert.ok(result.finalResponse.text.length > 5);
    } catch (err) {
      if (handleLiveAuthError(t, err)) return;
      throw err;
    }
  });
});

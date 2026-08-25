/**
 * @file Live Vertex AI Integration Tests for Project Improvement Recommender (P9-001)
 *
 * Runs strictly isolated under `npm run test:live:vertex` using real Google Cloud
 * Application Default Credentials (ADC) against live Google Cloud Vertex AI endpoints.
 *
 * Invariant: Minimal synthetic workload (max 2-3 real requests).
 * Gracefully skips if GOOGLE_CLOUD_PROJECT or ADC is not configured, or if ADC token expired.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { GeminiVertexAdapter } from '../../../src/clients/vertex/vertex-adapter.js';
import { ProjectImprovementRecommenderService } from '../../../src/services/project-improvement-recommender.service.js';
import { ProjectImprovementProposalSchema } from '../../../src/domain/career/project-improvement.schemas.js';

// Load local environment files if present
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

describe('Live Vertex AI Project Improvement Recommender Integration (P9-001)', () => {
  it('synthesizes live structured improvement proposal via Vertex AI foundation model', async (t) => {
    if (!isLiveVertexReady) {
      t.skip('Skipping live Vertex AI test: GOOGLE_CLOUD_PROJECT or ADC is not configured.');
      return;
    }

    const tenantId = crypto.randomUUID();
    const candidateId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const resourceId = crypto.randomUUID();

    const adapter = new GeminiVertexAdapter({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });

    const recommender = new ProjectImprovementRecommenderService({
      aiProvider: adapter,
    });

    const context = { tenantId };

    const syntheticCandidateProfile = {
      id: candidateId,
      tenantId,
      candidate: { id: candidateId, tenantId, fullName: 'Synthetic Test Candidate' },
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'fastapi',
          name: 'FastAPI',
          skillSlug: 'fastapi',
          skillName: 'FastAPI',
          provenanceStatus: 'VERIFIED',
        },
      ],
      projects: [
        {
          id: projectId,
          resourceId,
          name: 'synthetic-api-service',
          repositoryName: 'synthetic-api-service',
          description: 'Python API backend service',
          languages: { Python: 50000 },
        },
      ],
      evidence: [
        {
          id: crypto.randomUUID(),
          projectId,
          resourceId,
          resourceName: 'synthetic-api-service',
          evidenceType: 'CODE_USAGE',
          filePath: 'app/main.py',
          confidenceScore: 1.0,
        },
      ],
    };

    const syntheticJobDescription = {
      id: crypto.randomUUID(),
      tenantId,
      rawText: 'Looking for a Senior Python Engineer with Docker containerization experience.',
      requirements: [
        {
          id: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'docker',
          extractedValue: 'Docker',
          explanation: 'Experience with Docker containerization.',
        },
      ],
    };

    try {
      const proposal = await recommender.recommendImprovement(context, {
        candidateProfile: syntheticCandidateProfile,
        jobDescription: syntheticJobDescription,
      });

      assert.ok(proposal);
      assert.equal(proposal.tenantId, tenantId);
      assert.equal(proposal.candidateId, candidateId);
      assert.deepEqual(proposal.targetSkillSlugs, ['docker']);
      assert.equal(proposal.gapType, 'MISSING');
      assert.equal(proposal.status, 'PROPOSED');
      assert.ok(proposal.patch.files.length >= 1);
      assert.doesNotThrow(() => ProjectImprovementProposalSchema.parse(proposal));
    } catch (err) {
      if (handleLiveAuthError(t, err)) return;
      throw err;
    }
  });
});

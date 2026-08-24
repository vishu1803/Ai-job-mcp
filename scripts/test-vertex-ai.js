/**
 * @file Minimal Vertex AI ADC Smoke Test (P8-004 Preparation)
 *
 * Verifies Application Default Credentials (ADC) authentication and minimal
 * model inference with Google Cloud Vertex AI using @google/genai SDK.
 *
 * Safe: Never prints access tokens, credentials, or raw request payloads.
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultModelRegistry } from '../src/clients/ai/model-registry.js';

// Load local environment files if present (.env.local has priority)
dotenv.config();
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

function checkAdcFileAvailable() {
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

function classifyVertexError(err) {
  const message = String(err?.message || '');
  const status = err?.status || err?.statusCode || 0;

  if (status === 401 || /unauthenticated|unauthorized|invalid credential|token/i.test(message)) {
    return 'AUTHENTICATION';
  }
  if (status === 403 || /permission denied|forbidden/i.test(message)) {
    if (/billing/i.test(message)) return 'BILLING';
    if (/api.*(?:not enabled|disabled)|serviceusage/i.test(message)) return 'API_NOT_ENABLED';
    return 'PERMISSION';
  }
  if (status === 429 || /resource exhausted|quota|rate limit/i.test(message)) {
    return 'QUOTA';
  }
  if (status === 404 || /not found|unknown model/i.test(message)) {
    if (/project/i.test(message)) return 'INVALID_PROJECT';
    return 'MODEL_UNAVAILABLE';
  }
  if (/region|location/i.test(message)) {
    return 'REGION';
  }
  return 'OTHER';
}

export async function runVertexSmokeTest() {
  console.log('--- Vertex AI ADC Smoke Test Diagnostic ---');

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
  const hasAdc = checkAdcFileAvailable();

  console.log(`ADC_CONFIGURED=${hasAdc}`);

  if (!projectId) {
    console.log('project_configured=false');
    console.log('\n⚠️ SKIPPED: GOOGLE_CLOUD_PROJECT is not set in environment or .env.local.');
    console.log('To configure Vertex AI local testing:');
    console.log('  1. Add GOOGLE_CLOUD_PROJECT=<your-project-id> to .env.local');
    console.log('  2. Run: gcloud auth application-default login');
    return { skipped: true, reason: 'MISSING_PROJECT' };
  }

  console.log('project_configured=true');

  if (!hasAdc) {
    console.error('\n❌ ERROR: Application Default Credentials (ADC) not found.');
    console.error('Classification: ADC_NOT_CONFIGURED');
    console.error('Please run: gcloud auth application-default login');
    return { success: false, classification: 'ADC_NOT_CONFIGURED' };
  }

  // Resolve stable model from ModelRegistry
  const defaultModel = defaultModelRegistry.getDefaultModel();
  const fallbackModel = defaultModelRegistry.getModel('gemini-2.5-flash');
  const targetModelId =
    process.env.VERTEX_TEST_MODEL || defaultModel?.modelId || fallbackModel?.modelId;

  console.log(`provider=vertex-ai`);
  console.log(`authentication=ADC`);
  console.log(`location=${location}`);
  console.log(`model=${targetModelId}`);

  try {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: location,
    });

    const response = await ai.models.generateContent({
      model: targetModelId,
      contents: 'Reply with exactly: VERTEX_OK',
    });

    const text = response.text ? response.text.trim() : '';

    console.log(`success=true`);
    console.log(`response="${text}"\n`);

    if (text.includes('VERTEX_OK') || text.length > 0) {
      console.log('✅ VERTEX AI ADC SMOKE TEST PASSED');
      return { success: true, model: targetModelId, response: text };
    } else {
      console.warn('⚠️ Model responded but did not return exact VERTEX_OK text.');
      return { success: true, model: targetModelId, response: text };
    }
  } catch (err) {
    const classification = classifyVertexError(err);
    console.error(`\n❌ VERTEX AI ADC SMOKE TEST FAILED`);
    console.error(`Classification: ${classification}`);
    console.error(`Error Details: ${err.message || err}`);
    return { success: false, classification, error: err.message };
  }
}

// Execute CLI
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('test-vertex-ai.js')) {
  runVertexSmokeTest().then((res) => {
    if (!res.success && !res.skipped) {
      process.exitCode = 1;
    }
  });
}

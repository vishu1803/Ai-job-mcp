import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates } from '../../src/db/schema.js';
import { ResumeRepository } from '../../src/db/repositories/resume.repository.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { ResumeStudioDraftService } from '../../src/services/resume-studio-draft.service.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { buildApp } from '../../src/app.js';
import { studioPersonas } from '../fixtures/resume-studio-personas.js';

export const studioJobTarget = {
  title: 'Frontend Engineer',
  company: 'Synthetic Systems',
  sourceUrl: 'https://careers.example.test/jobs/frontend',
  rawDescription:
    'Requirements: React experience building accessible frontend systems. PostgreSQL database knowledge and writing clear technical documentation. Maintain readable interfaces and document engineering decisions.',
};
export async function startStudioHarness({ port = 0 } = {}) {
  assert.ok(Number.isInteger(port) && port >= 0 && port <= 65535);
  const target = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.port, '55447');
  assert.equal(target.pathname, '/product_audit_resume_studio');
  assert.ok(!process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT);
  const tenantIds = [crypto.randomUUID(), crypto.randomUUID()];
  const people = Array.from({ length: 4 }, (_, i) => ({
    tenantId: tenantIds[i === 1 ? 1 : 0],
    userId: crypto.randomUUID(),
    candidateId: crypto.randomUUID(),
    resumeId: crypto.randomUUID(),
    role: i === 2 ? 'OWNER' : 'MEMBER',
  }));
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-integrated-originals-'));
  const storage = new DocumentStorageService({ database: db, storageDir });
  await db
    .insert(tenants)
    .values(
      tenantIds.map((id) => ({ id, name: 'Synthetic integrated studio', slug: 'integrated-' + id }))
    );
  const sessions = [];
  const repo = new ResumeRepository(db);
  for (const [i, person] of people.entries()) {
    const source = studioPersonas()[i === 1 ? 'junior' : i === 2 ? 'experienced' : 'mid-level'];
    if (i === 0 || i === 3)
      source.experience[0].bullets[0] =
        'Implemented React views with the use of component interfaces in order to support internal workflows.';
    await db.insert(users).values({
      id: person.userId,
      tenantId: person.tenantId,
      email: person.userId + '@example.test',
      displayName: 'Synthetic Studio Candidate',
      role: person.role,
      status: 'ACTIVE',
    });
    await db.insert(candidates).values({
      id: person.candidateId,
      tenantId: person.tenantId,
      userId: person.userId,
      displayName: 'Synthetic Studio Candidate',
      profileMetadata: {
        resumeData: { ...source, sourceResumeId: person.resumeId, sourceVersion: 1 },
      },
    });
    const stored = await storage.storeEncryptedDocument({
      tenantId: person.tenantId,
      candidateId: person.candidateId,
      buffer: Buffer.from('Original synthetic master ' + i),
    });
    await repo.createResume({
      id: person.resumeId,
      tenantId: person.tenantId,
      candidateId: person.candidateId,
      version: 1,
      fileName: 'synthetic-master.txt',
      mimeType: 'text/plain',
      ...stored,
      lifecycleState: 'BASE_RESUME',
      isBaseResume: true,
    });
    sessions.push(await createSession(db, person));
  }
  const readonlyDraft = await new ResumeStudioDraftService({ database: db }).create(people[3], {
    source: { kind: 'RESUME', resumeId: people[3].resumeId },
    jobTarget: studioJobTarget,
  });
  await db.update(users).set({ role: 'READONLY' }).where(eq(users.id, people[3].userId));
  people[3].role = 'READONLY';
  let mode = 'normal',
    release,
    entered;
  const calls = [];
  const aiProvider = {
    async generateStructured(request) {
      calls.push(request);
      if (mode === 'failure') throw Error('Synthetic provider failure');
      if (mode === 'paused') {
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return {
        data: {
          proposedText: request.candidateFacts.variants.at(-1),
          factIds: ['fact-1'],
          truthState: 'CLAIMED',
        },
        provider: 'synthetic',
        modelId: 'deterministic-studio',
      };
    },
  };
  const app = await buildApp({ logger: false, resumeStudioAiProvider: aiProvider });
  await app.listen({ host: '127.0.0.1', port });
  const baseUrl = 'http://127.0.0.1:' + app.server.address().port;
  const headers = (person = 0) => ({
    'content-type': 'application/json',
    accept: 'application/json',
    origin: baseUrl,
    cookie: 'career_hub_session=' + sessions[person].rawToken,
    'x-csrf-token': generateCsrfToken(sessions[person].sessionId),
  });
  const request = (method, suffix, body, person = 0, extra = {}) =>
    fetch(baseUrl + '/api/v1/resume-studio' + suffix, {
      method,
      headers: { ...headers(person), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (person = 0) => {
    const response = await request(
      'POST',
      '/drafts',
      { source: { kind: 'RESUME', resumeId: people[person].resumeId }, jobTarget: studioJobTarget },
      person
    );
    const value = await response.json();
    assert.equal(response.status, 201, JSON.stringify(value));
    return value.data;
  };
  return {
    app,
    db,
    baseUrl,
    people,
    sessions,
    headers,
    request,
    create,
    readonlyDraft,
    calls,
    setProviderMode(value) {
      mode = value;
    },
    pauseProvider() {
      mode = 'paused';
      return new Promise((resolve) => {
        entered = resolve;
      });
    },
    releaseProvider() {
      mode = 'normal';
      release();
    },
    async close() {
      await app.close();
      for (const id of tenantIds) await db.delete(tenants).where(eq(tenants.id, id));
      await closeDatabase();
      await fs.rm(storageDir, { recursive: true, force: true });
    },
  };
}

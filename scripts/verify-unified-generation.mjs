/** Full saved-generation pipeline, synthetic facts and deterministic Vertex fixture; real PDF/DOCX compilation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { db, closeDatabase } from '../src/db/index.js';
import { tenants, users, candidates, resumes } from '../src/db/schema.js';
import { ResumeGenerationService } from '../src/services/resume-generation.service.js';
import { ResumeStudioDraftService } from '../src/services/resume-studio-draft.service.js';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import { resumeQualityProfileByKey } from '../tests/fixtures/prd002-resume-profiles.js';
import { fixtureProvider } from '../tests/fixtures/resume-writing-provider.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  process.env.NODE_ENV === 'test' &&
    target.hostname === '127.0.0.1' &&
    target.port === '55449' &&
    target.pathname === '/product_audit_unified_resume'
);
assert.ok(!process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT);
const directory = path.resolve(
  'output/unified-resume/integrated-generation',
  new Date().toISOString().replaceAll(':', '-') + '-' + crypto.randomUUID().slice(0, 8)
);
await fs.mkdir(directory, { recursive: true });
const context = { tenantId: crypto.randomUUID(), userId: crypto.randomUUID(), role: 'MEMBER' };
const candidateId = crypto.randomUUID(),
  resumeId = crypto.randomUUID();
const profile = JSON.parse(JSON.stringify(resumeQualityProfileByKey.student.profile));
const canonical = {
  identity: {
    name: profile.displayName,
    email: profile.canonicalEmail,
    phone: profile.phone,
    location: profile.location,
    headline: profile.headline,
    portfolioUrls: profile.links.map((link) => link.url),
  },
  summary: 'Original synthetic master summary.',
  skills: profile.skills,
  projects: profile.projects,
  experience: profile.experience,
  education: profile.education,
  certifications: profile.certifications,
  sourceResumeId: resumeId,
  sourceVersion: 1,
};
const storage = new DocumentStorageService({ database: db });
const originalBytes = Buffer.from(JSON.stringify(canonical, null, 2));
const outputs = [];
try {
  await db.insert(tenants).values({
    id: context.tenantId,
    name: 'Unified resume acceptance fixture',
    slug: 'unified-' + context.tenantId,
  });
  await db.insert(users).values({
    id: context.userId,
    tenantId: context.tenantId,
    email: context.userId + '@example.test',
    displayName: profile.displayName,
    role: 'MEMBER',
    status: 'ACTIVE',
  });
  await db.insert(candidates).values({
    id: candidateId,
    tenantId: context.tenantId,
    userId: context.userId,
    displayName: profile.displayName,
    canonicalEmail: profile.canonicalEmail,
    profileMetadata: { resumeData: canonical },
  });
  const stored = await storage.storeEncryptedDocument({
    tenantId: context.tenantId,
    candidateId,
    buffer: originalBytes,
  });
  await db.insert(resumes).values({
    id: resumeId,
    tenantId: context.tenantId,
    candidateId,
    version: 1,
    fileName: 'synthetic-master.txt',
    mimeType: 'text/plain',
    ...stored,
    isBaseResume: true,
    lifecycleState: 'BASE_RESUME',
  });
  await fs.writeFile(
    path.join(directory, 'master.synthetic.json'),
    JSON.stringify(canonical, null, 2)
  );
  const engine = new ResumeGenerationService({
    database: db,
    aiProvider: fixtureProvider(),
    storage,
  });
  const drafts = new ResumeStudioDraftService({ database: db, generationService: engine });
  for (const [key, title, rawDescription] of [
    [
      'backend',
      'Backend Engineer',
      'Requirements: Node.js and PostgreSQL. Build API endpoints for lending workflows, write integration tests for validation and error responses, and maintain database migrations.',
    ],
    [
      'fullstack',
      'Full-Stack Engineer',
      'Requirements: React and TypeScript. Build event registration forms, improve keyboard navigation and accessibility preferences, and validate event dates and participant details.',
    ],
  ]) {
    const generation = await engine.execute(context, {
      sourceResumeId: resumeId,
      origin: 'WEB',
      idempotencyKey: key,
      jobTarget: {
        title,
        company: 'Synthetic Systems',
        sourceUrl: 'https://careers.example.test/' + key,
        rawDescription,
      },
    });
    const draft = await drafts.create(context, { generationId: generation.id });
    assert.equal(
      draft.structuredResume.summary.text,
      generation.bundle.structuredResume.summary.text
    );
    assert.equal(generation.bundle.structuredResume.writing.providerUsed, true);
    for (const format of ['pdf', 'docx']) {
      const artifact = generation.bundle.artifacts[format];
      const bytes = await storage.getDecryptedDocument({
        tenantId: context.tenantId,
        candidateId,
        storageKey: artifact.storageKey,
        expectedPackageHash: generation.bundle.metadata.artifactPackageHash,
      });
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), artifact.contentHash);
      await fs.writeFile(path.join(directory, key + '.' + format), bytes);
    }
    await fs.writeFile(
      path.join(directory, key + '.json'),
      JSON.stringify({ generation, draft }, null, 2)
    );
    outputs.push({
      key,
      generationId: generation.id,
      draftId: draft.id,
      summary: draft.structuredResume.summary.text,
      projects: draft.structuredResume.projects.map((p) => p.name),
      verification: generation.bundle.metadata.verification,
    });
  }
  assert.notEqual(outputs[0].summary, outputs[1].summary);
  await fs.writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify(
      {
        synthetic: true,
        fixtureProvider: true,
        liveProvider: false,
        context,
        candidateId,
        resumeId,
        outputs,
      },
      null,
      2
    )
  );
  await fs.writeFile(
    path.resolve('output/unified-resume/integrated-generation/latest.json'),
    JSON.stringify({ directory, manifest: path.join(directory, 'manifest.json') }, null, 2)
  );
  console.log(
    JSON.stringify({
      directory,
      generated: outputs.length,
      exactStudioContent: true,
      liveProvider: false,
    })
  );
} catch (error) {
  console.error(
    JSON.stringify({ status: 'FAILED', code: error.code || error.name, message: error.message })
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

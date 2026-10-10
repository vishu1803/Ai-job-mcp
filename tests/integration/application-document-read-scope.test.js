// Executes real Drizzle queries on disposable loopback PostgreSQL; records SQL shape.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import * as schema from '../../src/db/schema.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { sealGeneratedPackage } from '../../src/services/evidence/artifact-policy.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(target.hostname) && /^\/product_audit_/.test(target.pathname)
);
const queries = [];
const loggedDb = drizzle(pool, {
  schema,
  logger: {
    logQuery(query) {
      queries.push(query);
    },
  },
});
const service = new ApplicationTrackingService({ database: loggedDb });
const tenantId = crypto.randomUUID(),
  userId = crypto.randomUUID(),
  candidateId = crypto.randomUUID();
const context = { tenantId, userId, candidateId, role: 'MEMBER' };
let applicationId, pkg;

before(async () => {
  await db
    .insert(schema.tenants)
    .values({ id: tenantId, name: 'Read scope fixture', slug: `reads-${tenantId}` });
  await db.insert(schema.users).values({
    id: userId,
    tenantId,
    email: `${userId}@example.test`,
    displayName: 'Fixture',
    role: 'MEMBER',
    status: 'ACTIVE',
  });
  await db
    .insert(schema.candidates)
    .values({ id: candidateId, tenantId, userId, displayName: 'Fixture' });
  const [application] = await db
    .insert(schema.jobApplications)
    .values({
      tenantId,
      candidateId,
      companyName: 'Fixture',
      jobTitle: 'Engineer',
      status: 'SAVED',
    })
    .returning();
  applicationId = application.id;
  pkg = await sealGeneratedPackage(db, context, {
    candidateId,
    tailoredResume: { title: 'Resume', markdownContent: 'Candidate-authored resume.' },
    coverLetter: { title: 'Letter', markdownContent: 'Candidate-authored letter.' },
    answers: {},
  });
  await db.insert(schema.applicationPackages).values({
    tenantId,
    candidateId,
    applicationId,
    version: 1,
    lifecycleState: 'CURRENT',
    packageHash: pkg.packageHash,
    packagePayload: pkg,
  });
  await db.insert(schema.tailoredDocuments).values(
    Array.from({ length: 8 }, (_, index) => ({
      tenantId,
      candidateId,
      applicationId,
      documentType: 'TAILORED_RESUME',
      version: index + 1,
      title: 'Historical resume',
      content: { markdownContent: 'Large archived text. '.repeat(2000) },
      renderedMarkdown: 'Large archived text. '.repeat(2000),
      contentHash: 'b'.repeat(64),
      metadata: { packageHash: 'b'.repeat(64) },
    }))
  );
});
after(async () => {
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  await closeDatabase();
});

test('regeneration context skips historical documents and stage reads without losing CURRENT package', async () => {
  queries.length = 0;
  const details = await service.getApplicationDetails(context, applicationId, {
    includeDocuments: false,
    includeStages: false,
  });
  assert.equal(details.application.id, applicationId);
  assert.equal(details.currentPackage.packageHash, pkg.packageHash);
  assert.deepEqual(details.tailoredDocuments, []);
  assert.deepEqual(details.stages, []);
  assert.ok(
    !queries.some((query) => /from "tailored_documents"|from "application_stages"/.test(query)),
    queries.join('\n')
  );
});

test('default details preserve historical API behavior', async () => {
  const details = await service.getApplicationDetails(context, applicationId);
  assert.equal(details.tailoredDocuments.length, 8);
  assert.ok(details.tailoredDocuments.every((document) => document.renderedMarkdown === null));
});

test('snapshot deduplication selects only matching document types, never historical body columns', async () => {
  queries.length = 0;
  const first = await service.attachPackageDocumentSnapshots(context, applicationId, pkg);
  assert.deepEqual(first.attached.sort(), ['TAILORED_COVER_LETTER', 'TAILORED_RESUME']);
  const documentReads = queries.filter((query) => /select .*from "tailored_documents"/.test(query));
  assert.ok(documentReads.length > 0);
  assert.ok(
    documentReads.every(
      (query) => !/"content"|"rendered_markdown"|"rendered_plain_text"|"citation_refs"/.test(query)
    ),
    documentReads.join('\n')
  );
  assert.ok(
    documentReads.some((query) => /packageHash/.test(query)),
    'Package identity must constrain the existence query'
  );
  const repeated = await service.attachPackageDocumentSnapshots(context, applicationId, pkg);
  assert.deepEqual(repeated.attached, []);
  assert.deepEqual(repeated.skipped.sort(), ['TAILORED_COVER_LETTER', 'TAILORED_RESUME']);
  const rows = await db
    .select()
    .from(schema.tailoredDocuments)
    .where(eq(schema.tailoredDocuments.applicationId, applicationId));
  assert.equal(rows.length, 10, 'Eight archived documents and exactly two new snapshots remain');
});

test('handoff snapshot reads include only the requested package and retain content integrity', async () => {
  queries.length = 0;
  const details = await service.getApplicationDetails(context, applicationId, {
    includeStages: false,
    documentPackageHash: pkg.packageHash,
  });
  assert.equal(details.tailoredDocuments.length, 2);
  assert.ok(
    details.tailoredDocuments.every(
      (document) =>
        document.content.markdownContent ===
        pkg[document.documentType === 'TAILORED_RESUME' ? 'tailoredResume' : 'coverLetter']
          .markdownContent
    )
  );
  const reads = queries.filter((query) => /from "tailored_documents"/.test(query));
  assert.equal(reads.length, 1);
  assert.ok(reads[0].includes("->>'packageHash' ="));
});

test('omitting history cannot bypass candidate ownership', async () => {
  queries.length = 0;
  await assert.rejects(
    service.getApplicationDetails({ ...context, candidateId: crypto.randomUUID() }, applicationId, {
      includeDocuments: false,
      includeStages: false,
    })
  );
  assert.ok(!queries.some((query) => /from "tailored_documents"/.test(query)));
});

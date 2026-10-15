/** Disposable local visual testing. Existing application, session/CSRF and fixture provider. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { startStudioHarness } from '../tests/helpers/resume-studio-harness.js';
import { db } from '../src/db/index.js';

assert.equal(process.env.NODE_ENV, 'test');
const target = new URL(process.env.DATABASE_URL);
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55447');
assert.equal(target.pathname, '/product_audit_resume_studio');
const runtime = path.resolve(process.env.STUDIO_VISUAL_RUNTIME || '');
assert.ok(runtime.startsWith(path.resolve(process.env.TEMP) + path.sep));
assert.ok(path.basename(runtime).startsWith('career-studio-visual-'));
const migrations = await db.execute(
  sql`SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations`
);
assert.equal(
  migrations.rows[0].total,
  25,
  'Use the previously verified migrations; this script never migrates'
);

async function available(port) {
  const probe = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', resolve);
    });
    await new Promise((resolve) => probe.close(resolve));
    return true;
  } catch {
    return false;
  }
}
let port = 4317;
while (!(await available(port))) {
  if (++port > 4327) throw Error('No free visual-testing port in 4317–4327');
}
const h = await startStudioHarness({ port });
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await h.close();
    process.exit(0);
  });
}
try {
  // This is the repository's existing dev-login fixture selector, not a new auth route.
  process.env.E2E_TEST_USER_EMAIL = h.people[0].userId + '@example.test';
  const draft = await h.create();
  const preview = await h.request('POST', '/drafts/' + draft.id + '/preview', {
    expectedRevision: draft.revision,
  });
  assert.equal(preview.status, 200);
  const document = (await preview.json()).data;
  assert.equal(document.status, 'READY');
  const bullet = draft.nodes.find(
    (node) => node.kind === 'BULLET' && node.path[0] === 'experience'
  );
  const proposal = await h.request('POST', '/drafts/' + draft.id + '/proposals', {
    expectedRevision: draft.revision,
    nodeId: bullet.nodeId,
  });
  assert.equal(proposal.status, 201);
  const studioUrl = h.baseUrl + '/resume-studio?draftId=' + draft.id;
  const loginUrl =
    h.baseUrl +
    '/auth/dev-login?e2e=1&returnTo=' +
    encodeURIComponent('/resume-studio?draftId=' + draft.id);
  await fs.writeFile(
    path.join(runtime, 'server.json'),
    JSON.stringify(
      {
        pid: process.pid,
        worktree: process.cwd(),
        branch: 'backend/resume-studio-20261014',
        baseUrl: h.baseUrl,
        studioUrl,
        loginUrl,
        migrations: 25,
        database: 'product_audit_resume_studio',
        databasePort: 55447,
        tenantIds: h.people.filter((p, i) => i < 2).map((p) => p.tenantId),
        draftId: draft.id,
        provider: 'Deterministic synthetic fixture; no live AI requests',
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log('Integrated Studio visual server ready: ' + studioUrl);
  console.log(
    'Use the existing fixture dev-login link recorded in server.json. No migrations run.'
  );
} catch (error) {
  console.error('Visual server initialization failed: ' + error.message);
  await h.close();
  process.exit(1);
}

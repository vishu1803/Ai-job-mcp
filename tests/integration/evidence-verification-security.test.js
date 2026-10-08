import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resourceConnections,
  resources,
  evidenceItems,
  candidateSkills,
  candidateIdentities,
} from '../../src/db/schema.js';
import { GitHubEvidenceExtractorService } from '../../src/extractors/github/github-evidence-extractor.js';
import { EvidenceLinkingService } from '../../src/services/evidence-linking.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import {
  verifiedSourceFact,
  trustDatabaseEvidence,
} from '../../src/services/evidence/verification-policy.js';
import { registerCareerProfileTools } from '../../src/mcp/tools/career-profile-tools.js';
import { enforceEvidenceTrust } from '../../src/services/evidence/verification-policy.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';

let tenant, user, candidate, connection, resource, context;
const extractor = new GitHubEvidenceExtractorService();
const blob = (content) =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest('hex');
function connectorFor(source = "import React from 'react';", options = {}) {
  const files = { 'src/app.js': source, 'package.json': '{"dependencies":{"express":"^5"}}' };
  return {
    getRepository: async () => ({
      id: 123,
      fullName: 'owner/repo',
      defaultBranch: 'main',
      ...options.repository,
    }),
    getBranchHeadSha: async () => ({ commitSha: 'a'.repeat(40) }),
    getRepositoryTree: async (_ctx, _cred, _id, opts) => {
      assert.equal(opts.treeSha, 'a'.repeat(40));
      return {
        entries: Object.entries(files).map(([path, content]) => ({
          path,
          type: 'blob',
          sha: blob(content),
        })),
      };
    },
    getFileContent: async (_ctx, _cred, _id, path, opts) => {
      assert.equal(opts.ref, 'a'.repeat(40));
      return { path, content: files[path], sha: blob(files[path]) };
    },
    getLanguages: async () => ({ languages: { JavaScript: 5000 } }),
    getReadme: async () => ({ content: '```js\nimport React from "react";\n```' }),
    getRecentCommits: async () => ({
      commits: [
        {
          sha: 'a'.repeat(40),
          author: { id: 999, login: 'owner' },
          message: 'feat(react): example',
        },
      ],
    }),
  };
}
const extract = (connector) =>
  extractor.extractRepositoryEvidence({
    context,
    candidateId: candidate.id,
    resourceId: resource.id,
    connector,
    credentials: {},
  });
const rows = async () =>
  trustDatabaseEvidence(
    await db.select().from(evidenceItems).where(eq(evidenceItems.resourceId, resource.id)),
    { tenantId: tenant.id, candidateId: candidate.id }
  );

for (const [name, externalAccountId, verified, expectedCount] of [
  ['verified stable GitHub ID', '999', true, 1],
  ['unverified stable GitHub ID', '999', false, 0],
  ['same username but different stable ID', '1234', true, 0],
])
  test(`commit attribution: ${name}`, async () => {
    await db.insert(candidateIdentities).values({
      tenantId: tenant.id,
      candidateId: candidate.id,
      provider: 'GITHUB_APP',
      externalAccountId,
      externalUsername: 'owner',
      verified,
    });
    await extract(connectorFor());
    const contributions = (await rows()).filter((e) => e.evidenceType === 'COMMIT_CONTRIBUTION');
    assert.equal(contributions.length, expectedCount);
    for (const contribution of contributions) {
      assert.equal(contribution.metadata.githubAuthorId, '999');
      assert.equal(contribution.metadata.attributionMethod, 'GITHUB_ACCOUNT_ASSOCIATION');
      assert.equal(verifiedSourceFact(contribution), false);
      assert.equal(contribution.metadata.verification.status, 'OBSERVED');
    }
  });

beforeEach(async () => {
  [tenant] = await db
    .insert(tenants)
    .values({ name: 'Issue06 fixture', slug: `issue06-${randomUUID()}` })
    .returning();
  [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: `${randomUUID()}@example.test`,
      displayName: 'Candidate',
      role: 'OWNER',
    })
    .returning();
  [candidate] = await db
    .insert(candidates)
    .values({ tenantId: tenant.id, userId: user.id, displayName: 'Candidate' })
    .returning();
  [connection] = await db
    .insert(resourceConnections)
    .values({
      tenantId: tenant.id,
      userId: user.id,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      displayName: 'Fixture',
      externalAccountId: '123',
      encryptedCredentials: 'synthetic-not-a-secret',
      status: 'ACTIVE',
    })
    .returning();
  [resource] = await db
    .insert(resources)
    .values({
      tenantId: tenant.id,
      candidateId: candidate.id,
      connectionId: connection.id,
      provider: 'GITHUB_APP',
      resourceType: 'REPOSITORY',
      externalResourceId: '123',
      name: 'owner/repo',
      displayName: 'Repository',
      status: 'ACTIVE',
    })
    .returning()
    .catch((error) => {
      throw new Error(error.cause?.message || 'Fixture creation failed');
    });
  context = { tenantId: tenant.id, userId: user.id, connectionId: connection.id, role: 'OWNER' };
});
afterEach(async () => {
  if (tenant) await db.delete(tenants).where(eq(tenants.id, tenant.id));
});
after(async () => {
  await closeDatabase(pool);
});

test('real pipeline: commented import produces no CODE_IMPORT_USAGE and no verified skill', async () => {
  await extract(connectorFor("/*\nimport React from 'react';\n*/"));
  assert.equal((await rows()).filter((x) => x.evidenceType === 'CODE_IMPORT_USAGE').length, 0);
  const skills = await db
    .select()
    .from(candidateSkills)
    .where(eq(candidateSkills.candidateId, candidate.id));
  assert.ok(skills.length > 0);
  assert.ok(skills.every((x) => !['VERIFIED', 'CORROBORATED'].includes(x.provenanceStatus)));
});
test('pinned executable import verifies only a precise source fact, never candidate proficiency', async () => {
  await extract(connectorFor());
  const evidence = (await rows()).find((x) => x.evidenceType === 'CODE_IMPORT_USAGE');
  assert.equal(verifiedSourceFact(evidence), true);
  assert.equal(evidence.metadata.verification.attribution.status, 'UNATTRIBUTED');
  assert.equal(evidence.sourceLocation.commitSha, 'a'.repeat(40));
  assert.equal(evidence.sourceLocation.lineRange.start, 1);
  const view = await new CandidateProfileService().getProfile(context, candidate.id);
  assert.ok(view.skills.every((x) => !['VERIFIED', 'CORROBORATED'].includes(x.provenanceStatus)));
});
test('CLAIMED skill stays CLAIMED after relinking with client confidence=1', async () => {
  await extract(connectorFor());
  const e = (await rows()).find((x) => x.evidenceType === 'CODE_IMPORT_USAGE');
  await db
    .update(candidateSkills)
    .set({ provenanceStatus: 'CLAIMED' })
    .where(eq(candidateSkills.skillId, e.skillId));
  const result = await new EvidenceLinkingService().linkEvidenceToSkill({
    context,
    candidateId: candidate.id,
    evidenceId: e.id,
    skillId: e.skillId,
    requestedConfidence: 1,
  });
  assert.equal(result.candidateSkill.provenanceStatus, 'CLAIMED');
});
test('database guards stale candidate-level VERIFIED updates', async () => {
  await extract(connectorFor());
  const [s] = await db
    .select()
    .from(candidateSkills)
    .where(eq(candidateSkills.candidateId, candidate.id));
  const [result] = await db
    .update(candidateSkills)
    .set({ provenanceStatus: 'VERIFIED', confidenceScore: 1 })
    .where(eq(candidateSkills.id, s.id))
    .returning();
  assert.equal(result.provenanceStatus, 'INFERRED');
  assert.equal(result.metadata.issue06RejectedPromotion, 'VERIFIED');
});
for (const code of [403, 404, 429, 503])
  test(`GitHub ${code} revalidation invalidates historical verified fact, no optimistic promotion`, async () => {
    await extract(connectorFor());
    const c = connectorFor();
    c.getRepository = async () => {
      throw new Error(`GitHub ${code}`);
    };
    await assert.rejects(extract(c));
    const evidence = await rows();
    assert.ok(evidence.length > 0);
    assert.ok(evidence.every((x) => !verifiedSourceFact(x)));
  });
for (const change of ['deleted repository', 'suspended installation', 'revoked installation'])
  test(`source lifecycle: ${change} fails closed`, async () => {
    await extract(connectorFor());
    const c = connectorFor();
    c.getRepositoryTree = async () => {
      throw new Error(change);
    };
    await assert.rejects(extract(c));
    assert.ok((await rows()).every((x) => !verifiedSourceFact(x)));
  });
test('missing immutable commit cannot be accepted', async () => {
  const c = connectorFor();
  c.getBranchHeadSha = async () => ({ commitSha: 'HEAD' });
  await assert.rejects(extract(c));
  assert.equal((await rows()).length, 0);
});
test('tree/content mismatch cannot verify a changed commit', async () => {
  const c = connectorFor();
  const get = c.getFileContent;
  c.getFileContent = async (...args) => ({
    ...(await get(...args)),
    content: "import evil from 'evil';",
  });
  await assert.rejects(extract(c));
  assert.equal((await rows()).length, 0);
});
test('malformed source leaves observations only', async () => {
  await extract(connectorFor("import React from 'react'; {{{"));
  assert.ok((await rows()).every((x) => !verifiedSourceFact(x)));
});
test('foreign user cannot extract or relink evidence', async () => {
  await extract(connectorFor());
  const e = (await rows())[0];
  const original = context;
  context = { ...context, userId: randomUUID() };
  await assert.rejects(extract(connectorFor()));
  await assert.rejects(
    new EvidenceLinkingService().linkEvidenceToSkill({
      context,
      candidateId: candidate.id,
      evidenceId: e.id,
      skillId: e.skillId,
    })
  );
  context = original;
});
test('foreign tenant cannot extract or read evidence', async () => {
  await extract(connectorFor());
  const e = (await rows())[0];
  const original = context;
  context = { ...context, tenantId: randomUUID() };
  await assert.rejects(extract(connectorFor()));
  await assert.rejects(
    new EvidenceLinkingService().getEvidenceById({
      context,
      candidateId: candidate.id,
      evidenceId: e.id,
    })
  );
  context = original;
});
test('conflicting repository identity rejected', async () => {
  await assert.rejects(extract(connectorFor(undefined, { repository: { id: 456 } })));
});
test('resource cannot be associated with another candidate', async () => {
  await db.update(resources).set({ candidateId: null }).where(eq(resources.id, resource.id));
  await assert.rejects(extract(connectorFor()));
});
test('revoked database connection invalidates evidence and blocks stale VERIFIED restore', async () => {
  await extract(connectorFor());
  const e = (await rows()).find((x) => verifiedSourceFact(x));
  await db
    .update(resourceConnections)
    .set({ status: 'REVOKED' })
    .where(eq(resourceConnections.id, connection.id));
  assert.ok((await rows()).every((x) => !verifiedSourceFact(x)));
  await assert.rejects(
    db.update(evidenceItems).set({ metadata: e.metadata }).where(eq(evidenceItems.id, e.id))
  );
  await assert.rejects(extract(connectorFor()));
});
test('database rejects cross-candidate source proof substitution', async () => {
  await extract(connectorFor());
  const e = (await rows()).find((x) => verifiedSourceFact(x));
  await assert.rejects(
    db
      .update(evidenceItems)
      .set({
        metadata: {
          ...e.metadata,
          verification: { ...e.metadata.verification, candidateId: randomUUID() },
        },
      })
      .where(eq(evidenceItems.id, e.id))
  );
});
test('concurrent ingestion epochs prevent stale operation restoring VERIFIED', async () => {
  let resume, entered;
  const held = new Promise((r) => {
    entered = r;
  });
  const barrier = new Promise((r) => {
    resume = r;
  });
  const c = connectorFor();
  c.getBranchHeadSha = async () => {
    entered();
    await barrier;
    return { commitSha: 'a'.repeat(40) };
  };
  const first = extract(c).then(
    () => 'SUCCESS',
    () => 'REJECTED'
  );
  await held;
  await extract(connectorFor());
  resume();
  assert.equal(await first, 'REJECTED');
  assert.equal((await rows()).filter(verifiedSourceFact).length, 1);
});

for (const relationship of [
  'personal owner',
  'organization member',
  'collaborator',
  'third party',
  'fork',
  'shared authorship',
  'ambiguous commit identity',
]) {
  test(`${relationship}: visibility alone never attributes source facts or verifies candidate skill`, async () => {
    const c = connectorFor(undefined, {
      repository: { fork: relationship === 'fork', owner: { id: 999, login: 'owner' } },
    });
    await extract(c);
    const e = (await rows()).find(verifiedSourceFact);
    assert.equal(e.metadata.verification.attribution.status, 'UNATTRIBUTED');
    assert.equal((await rows()).filter((x) => x.evidenceType === 'COMMIT_CONTRIBUTION').length, 0);
    const skills = await db
      .select()
      .from(candidateSkills)
      .where(eq(candidateSkills.candidateId, candidate.id));
    assert.ok(skills.every((x) => x.provenanceStatus !== 'VERIFIED'));
  });
}
test('actual MCP career profile handler cannot promote repository observations', async () => {
  await extract(connectorFor());
  const handlers = new Map();
  registerCareerProfileTools({
    registerTool(definition, handler) {
      handlers.set(definition.name, handler);
    },
  });
  const result = await handlers.get('get_career_profile')(
    { ...context, candidateId: candidate.id },
    {}
  );
  assert.ok(
    result.profile.primarySkills.every(
      (x) => !['VERIFIED', 'CORROBORATED'].includes(x.provenanceStatus)
    )
  );
  assert.equal(
    result.profile.highlightedProjects.filter((x) => x.provenanceStatus === 'VERIFIED').length,
    0
  );
});
test('evidence persistence failure rolls back all new facts and skills', async () => {
  // Fault applies ONLY to this synthetic resource; real PostgreSQL transaction rollback.
  const functionName = `issue06_fail_${resource.id.replaceAll('-', '')}`;
  await pool.query(
    `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resource_id='${resource.id}'::uuid THEN RAISE EXCEPTION 'Synthetic evidence persistence failure'; END IF; RETURN NEW; END $$`
  );
  await pool.query(
    `CREATE TRIGGER ${functionName} BEFORE INSERT ON evidence_items FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
  );
  try {
    await assert.rejects(extract(connectorFor()));
    assert.equal((await rows()).length, 0);
    assert.equal(
      (await db.select().from(candidateSkills).where(eq(candidateSkills.candidateId, candidate.id)))
        .length,
      0
    );
  } finally {
    await pool.query(`DROP TRIGGER ${functionName} ON evidence_items`);
    await pool.query(`DROP FUNCTION ${functionName}()`);
  }
});

test('forged source metadata through profile update cannot create verified evidence', async () => {
  await extract(connectorFor());
  const authoritative = (await rows()).find(verifiedSourceFact);
  const forged = JSON.parse(JSON.stringify(authoritative));
  forged.provenanceStatus = 'VERIFIED';
  forged.verificationStatus = 'VERIFIED';
  const service = new CandidateProfileService(db);
  const updated = await service.updateProfile(context, candidate.id, {
    profileMetadata: { userCustom: { suppliedEvidence: forged } },
  });
  assert.equal(updated.profileMetadata.userCustom.suppliedEvidence.verificationStatus, 'OBSERVED');
  const view = await service.getProfile(context, candidate.id);
  assert.equal(
    view.candidate.profileMetadata.userCustom.suppliedEvidence.metadata.verification.status,
    'OBSERVED'
  );
  assert.equal(
    verifiedSourceFact(view.candidate.profileMetadata.userCustom.suppliedEvidence),
    false
  );
  assert.equal(
    (await rows()).filter(verifiedSourceFact).length,
    1,
    'legitimate source fact remains usable'
  );
});

test('real ingestion to profile, matching, application documents and MCP retains weak trust', async () => {
  await extract(connectorFor());
  const service = new CandidateProfileService(db);
  await service.addSkillClaim(context, candidate.id, {
    skillSlug: 'react',
    claimNote: 'Candidate reports learning React.',
  });
  const view = await service.getProfile(context, candidate.id);
  const react = view.skills.find((s) => s.slug === 'react');
  assert.equal(react.provenanceStatus, 'CLAIMED');
  const job = {
    id: randomUUID(),
    tenantId: tenant.id,
    title: 'Frontend Engineer',
    company: 'Fixture Employer',
    requirements: [
      {
        id: randomUUID(),
        tenantId: tenant.id,
        category: 'SKILL',
        importance: 'REQUIRED',
        skillSlug: 'react',
        extractedValue: 'React',
        rawSnippet: 'React',
      },
    ],
  };
  const matching = EvidenceMatchingService.matchJobToCandidate(context, job, {
    ...view,
    id: candidate.id,
    tenantId: tenant.id,
  });
  assert.equal(matching.summary.matchedCount, 0);
  assert.equal(matching.requirementMatches[0].candidateProvenance, 'CLAIMED');
  const artifacts = new CandidateArtifactContentService({
    database: db,
    candidateProfileService: service,
  });
  const docs = await artifacts.generateApplicationDocuments({
    tenantId: tenant.id,
    userId: user.id,
    candidateId: candidate.id,
    jobPosting: job,
  });
  assert.equal(docs.coverLetter.matchedVerifiedSkills.length, 0);
  assert.equal(docs.evidence.verifiedSkillsMatched.length, 0);
  assert.match(
    docs.coverLetter.markdownContent,
    /self-reported|repository technology observations/i
  );
  assert.doesNotMatch(
    docs.coverLetter.markdownContent,
    /verified proficiency|production-grade systems|I built/
  );
  assert.ok(
    docs.resume.skillAudit.every((s) => !['VERIFIED', 'CORROBORATED'].includes(s.provenance))
  );
  const mcp = await handleGetCandidateProfile(
    context,
    { candidateId: candidate.id },
    { db, candidateProfileService: service }
  );
  assert.equal(mcp.topSkills.find((s) => s.slug === 'react').provenanceStatus, 'CLAIMED');
  const replay = enforceEvidenceTrust(JSON.parse(JSON.stringify(view)));
  assert.equal(
    replay.skills.find((s) => s.slug === 'react').primaryEvidence.verificationStatus,
    'OBSERVED'
  );
});

/** Controlled product boundaries: no database connection, provider call or external action. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardPage } from '../../src/views/dashboard.page.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { registerCareerResources } from '../../src/mcp/resources/career-resources.js';

test('dashboard renderer includes the formerly missing repository-backed project', () => {
  const html = renderDashboardPage({
    user: { displayName: 'Audit Candidate', email: 'audit@example.test' },
    tenant: { name: 'Disposable audit' },
    readiness: { readinessScore: 0, missingFields: ['phone'] },
    projects: [{ id: 'audit-project', name: 'cloud-mesh-kernel' }],
  });
  assert.match(html, /cloud-mesh-kernel/);
  assert.match(html, /\/projects\/audit-project/);
  assert.match(html, /Add Phone number/);
});

test('actual discovery configuration used by web Radar has zero live providers and no jobs', async () => {
  const service = new JobDiscoveryService({ includeSynthetic: false });
  const result = await service.searchJobs({ query: 'Engineering', limit: 15 });
  assert.equal(service.greenhouseBoards.length, 0);
  assert.equal(service.leverSites.length, 0);
  assert.deepEqual(result.jobs, []);
});

test('MCP job resource resolves the same posting as the actual discovery service', async () => {
  const jobId = '5d37938b-18ef-4103-8d93-4628a7af2304';
  const job = {
    id: jobId,
    source: 'GREENHOUSE',
    provider: 'GREENHOUSE',
    externalJobId: 'audit-1',
    company: 'Fixture Company',
    title: 'Software Engineer',
    location: 'Remote',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    description: 'Fixture description',
    skills: [],
    requirements: [],
    responsibilities: [],
    applicationUrl: 'https://boards.greenhouse.io/fixture/jobs/audit-1',
    sourceUrl: 'https://boards.greenhouse.io/fixture/jobs/audit-1',
    postedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
  };
  const service = new JobDiscoveryService({ customJobs: [job], includeSynthetic: false });
  assert.equal((await service.getJobPosting({ jobId })).id, jobId);
  const handlers = new Map();
  registerCareerResources(
    { registerResource: (definition, handler) => handlers.set(definition.uri, handler) },
    {
      database: {},
      profileService: {},
      jobDiscoveryService: service,
    }
  );
  const result = await handlers.get('career://jobs/{jobId}')(
    {
      tenantId: 'audit-tenant',
      userId: 'audit-user',
      role: 'MEMBER',
    },
    `career://jobs/${jobId}`,
    { jobId }
  );
  assert.equal(result.id, jobId);
});

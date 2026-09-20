/**
 * @file P57: Multi-Portal End-to-End Test Suite.
 *
 * Tests the complete extension pipeline across multiple portal paradigms without external DOM dependencies:
 * 1. Greenhouse ATS (known portal, high confidence, full form extraction).
 * 2. Lever ATS (SPA navigation reconciliation, preservation of application state).
 * 3. Unknown portal with schema.org/JobPosting JSON-LD (structured generic fallback, high confidence).
 * 4. Unknown portal with semantic DOM only (unstructured fallback, medium confidence).
 * 5. Authoritative backend contract: verifies that canonical recommendedProjects survive from backend to client.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';

import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, projects } from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { FormDetector } from '../../extension/content/form-detector.js';

function createTestDoc({
  title = '',
  company = '',
  description = '',
  requirements = [],
  jsonLd = null,
  inputs = [],
  isGreenhouse = false,
  isLever = false,
  isWorkday = false,
}) {
  const titleNode = {
    tagName: 'H1',
    textContent: title,
    cloneNode() {
      return { tagName: 'H1', textContent: title, querySelectorAll: () => [] };
    },
    querySelectorAll: () => [],
  };
  const companyNode = {
    tagName: 'DIV',
    textContent: company,
    cloneNode() {
      return this;
    },
    querySelectorAll: () => [],
  };
  const descNode = {
    tagName: 'DIV',
    textContent: description,
    querySelectorAll: (s) =>
      s.includes('li') ? requirements.map((r) => ({ textContent: r })) : [],
  };
  const jsonLdNode = jsonLd
    ? {
        tagName: 'SCRIPT',
        attrs: { type: 'application/ld+json' },
        textContent: JSON.stringify(jsonLd),
      }
    : null;

  const doc = {
    body: descNode,
    querySelector(sel) {
      const s = sel.toLowerCase();
      // ATS specific overrides
      if (s.includes('automation') || s.includes('workday')) return isWorkday ? descNode : null;
      if (s === '#app_body' || s.includes('job-post') || s === '#content.job__description')
        return isGreenhouse ? descNode : null;
      if (
        s.includes('posting-headline') ||
        s.includes('posting-categories') ||
        s.includes('lever-job')
      )
        return isLever ? titleNode : null;

      // Filter out vendor-specific selectors so generic and JSON-LD fallbacks are not intercepted
      if (
        s.includes('job-title-title') ||
        s.includes('jobsearch') ||
        s.includes('jobdescriptiontext') ||
        s.includes('jobs-') ||
        s.includes('job-details') ||
        s.includes('topcard') ||
        s.includes('top-card') ||
        s.includes('naukri') ||
        s.includes('shine') ||
        s.includes('foundit') ||
        s.includes('cutshort') ||
        s.includes('instahyre') ||
        s.includes('hirect') ||
        s.includes('iimjobs') ||
        s.includes('timesjobs')
      ) {
        return null;
      }

      if (s.includes('json') && jsonLdNode) return jsonLdNode;
      if (
        s === 'h1' ||
        s === 'h2' ||
        s.includes('og:title') ||
        s === '.job-title' ||
        s === '#job-title'
      )
        return titleNode;
      if (s.includes('company') || s.includes('organization')) return companyNode;
      if (
        s === 'article' ||
        s === 'main' ||
        s === '.content' ||
        s === '.job-description' ||
        s === '.description' ||
        s === 'p' ||
        s === '#content'
      )
        return descNode;
      if (s.includes('form')) {
        return {
          querySelectorAll: (inp) =>
            inp.includes('input') || inp.includes('select') || inp.includes('textarea')
              ? inputs
              : [],
        };
      }
      return null;
    },
    querySelectorAll(sel) {
      const s = sel.toLowerCase();
      if (s.includes('json') && jsonLdNode) return [jsonLdNode];
      if (s.includes('input') || s.includes('select') || s.includes('textarea')) return inputs;
      if (s.includes('step')) return [{ textContent: 'Step 1 of 3: Personal Information' }];
      if (s.includes('li')) return requirements.map((r) => ({ textContent: r }));
      return [];
    },
  };

  inputs.forEach((inp) => {
    inp.ownerDocument = doc;
    inp.closest = () => null;
    inp.getAttribute = (attr) => (inp.attrs ? inp.attrs[attr] : null);
  });

  return doc;
}

describe('P57: Multi-Portal End-to-End Suite', () => {
  let app;
  const createdTenantIds = [];
  let tenant;
  let user;
  let candidate;
  let session;
  let project1;
  let project2;

  before(async () => {
    app = buildApp({ db });
    await app.ready();

    // 1. Seed tenant, user, candidate
    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);

    [tenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'P57 MultiPortal Org',
        slug: `p57-multi-${Date.now()}`,
      })
      .returning();

    const userId = crypto.randomUUID();
    [user] = await db
      .insert(users)
      .values({
        id: userId,
        tenantId: tenant.id,
        email: `multi-candidate-${Date.now()}@example.test`,
        displayName: 'Alex Candidate',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateId = crypto.randomUUID();
    [candidate] = await db
      .insert(candidates)
      .values({
        id: candidateId,
        tenantId: tenant.id,
        userId: user.id,
        displayName: 'Alex Candidate',
        canonicalEmail: user.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'COMPLETED' },
          resumeData: {
            identity: { fullName: 'Alex Candidate', email: user.email },
            skills: ['Node.js', 'React', 'Docker', 'PostgreSQL', 'TypeScript', 'Redis'],
            projects: [
              {
                title: 'Cloud-Distributed-Task-Queue',
                slug: 'cloud-task-queue',
                description:
                  'Distributed async task queue built with Node.js, Redis, and Docker with high availability',
                skills: ['Node.js', 'Redis', 'Docker', 'TypeScript'],
                bullets: [
                  'Architected distributed async task queue with Node.js and Redis',
                  'Scaled containerized microservices using Docker to handle 10k req/sec',
                ],
              },
              {
                title: 'Realtime-Collaboration-Canvas',
                slug: 'realtime-canvas',
                description:
                  'Collaborative real-time canvas built with React, WebSockets, and Canvas API',
                skills: ['React', 'TypeScript', 'WebSocket'],
                bullets: ['Real-time multi-user collaborative canvas with React and WebSockets'],
              },
            ],
          },
        },
      })
      .returning();

    // 2. Seed verified portfolio projects with valid schema columns and metadata
    [project1] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        candidateId: candidate.id,
        name: 'Cloud-Distributed-Task-Queue',
        slug: 'cloud-task-queue',
        headline: 'Distributed Task Queue in Node.js',
        summary:
          'Distributed async task queue built with Node.js, Redis, and Docker with high availability',
        isHighlighted: true,
        metadata: {
          technologies: ['Node.js', 'Redis', 'Docker', 'TypeScript'],
          skills: ['Node.js', 'Redis', 'Docker', 'TypeScript'],
          description:
            'Distributed async task queue built with Node.js, Redis, and Docker with high availability',
        },
      })
      .returning();

    [project2] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        candidateId: candidate.id,
        name: 'Realtime-Collaboration-Canvas',
        slug: 'realtime-canvas',
        headline: 'Realtime Collaboration Canvas in React',
        summary: 'Collaborative real-time canvas built with React, WebSockets, and Canvas API',
        isHighlighted: true,
        metadata: {
          technologies: ['React', 'TypeScript', 'WebSocket'],
          skills: ['React', 'TypeScript', 'WebSocket'],
          description:
            'Collaborative real-time canvas built with React, WebSockets, and Canvas API',
        },
      })
      .returning();

    // 3. Create active session
    session = await createSession(db, { userId: user.id, tenantId: tenant.id });
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(projects).where(inArray(projects.tenantId, createdTenantIds));
      await db.delete(candidates).where(inArray(candidates.tenantId, createdTenantIds));
      await db.delete(users).where(inArray(users.tenantId, createdTenantIds));
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (app) await app.close();
    await closeDatabase();
  });

  it('1. Greenhouse ATS: Extraction, capabilities, form detection, and authoritative analysis', async () => {
    const inputs = [
      { id: 'first_name', name: 'first_name', type: 'text', required: true },
      { id: 'last_name', name: 'last_name', type: 'text', required: true },
      { id: 'email', name: 'email', type: 'email', required: true },
      { id: 'resume', name: 'resume', type: 'file', required: true },
    ];

    const doc = createTestDoc({
      title: 'Senior Backend Engineer',
      company: 'Stripe',
      description:
        'We are looking for a Senior Backend Engineer to build high-scale distributed systems with Node.js and Docker. 5+ years experience required.',
      requirements: [
        '5+ years with Node.js and PostgreSQL',
        'Experience with Docker and distributed systems',
      ],
      inputs,
      isGreenhouse: true,
    });

    const greenhouseUrl = 'https://boards.greenhouse.io/stripe/jobs/5544332';
    const result = JobDetectionEngine.evaluate(doc, greenhouseUrl);

    // Assert detection & capabilities
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.confidence, 'HIGH');
    assert.strictEqual(result.portalMetadata.portalName, 'Greenhouse ATS');
    assert.strictEqual(result.portalMetadata.capabilities.jobExtraction, true);
    assert.strictEqual(result.portalMetadata.capabilities.formExtraction, true);
    assert.strictEqual(result.portalMetadata.capabilities.automaticFieldMapping, true);

    assert.strictEqual(result.jobData.title, 'Senior Backend Engineer');

    // Assert form detection
    const formInfo = FormDetector.detect(doc);
    assert.strictEqual(formInfo.hasForm, true);
    assert.strictEqual(formInfo.fields.length >= 4, true);

    // Call backend authoritative endpoint
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      cookies: { career_hub_session: session.rawToken },
      headers: {
        'X-AiCareersHub-Extension': 'true',
      },
      payload: { job: result.jobData },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.fitAnalysis);

    // Authoritative recommended projects contract (Rule 1 & Rule 2)
    assert.ok(Array.isArray(body.recommendedProjects));
    assert.strictEqual(body.recommendedProjects.length > 0, true);
    assert.ok(
      body.recommendedProjects.some(
        (p) => p.projectId === project1.id || p.projectId === project2.id
      )
    );
  });

  it('2. Lever ATS & SPA Navigation Reconciliation (Rule 5)', async () => {
    const doc = createTestDoc({
      title: 'Full-Stack Engineer',
      company: 'Datadog',
      description:
        'Datadog is building realtime collaboration tools and telemetry dashboards with React and TypeScript.',
      isLever: true,
    });

    const leverUrl = 'https://jobs.lever.co/datadog/112233';
    const result = JobDetectionEngine.evaluate(doc, leverUrl);

    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.confidence, 'HIGH');
    assert.strictEqual(result.portalMetadata.portalName, 'Lever ATS');

    // Simulate durable workflow store
    const storageMap = new Map();
    const fakeStorage = {
      get: (key) => Promise.resolve({ [key]: storageMap.get(key) }),
      set: (obj) => {
        Object.entries(obj).forEach(([k, v]) => storageMap.set(k, v));
        return Promise.resolve();
      },
      remove: (key) => {
        storageMap.delete(key);
        return Promise.resolve();
      },
    };

    const store = new DurableWorkflowStore(fakeStorage);
    const tabId = 303;
    const fingerprint = JobIdentity.deriveJobFingerprint(result.jobData);

    await store.saveTabState(tabId, {
      tabId,
      jobFingerprint: fingerprint,
      jobData: result.jobData,
      applicationId: 'app-lever-112233',
      packageHash: 'sha256-lever-hash',
      recommendedProjects: [project2],
      workflowState: 'APPLICATION_READY',
    });

    // SPA Navigation: user navigates to /apply step
    const navResult = await store.reconcileNavigation(tabId, {
      sourceUrl: 'https://jobs.lever.co/datadog/112233/apply?step=contact',
      title: result.jobData.title,
      company: result.jobData.company,
    });

    assert.strictEqual(navResult.reconciled, true);
    assert.strictEqual(
      navResult.applicationId,
      'app-lever-112233',
      'applicationId must survive route transition'
    );
    assert.strictEqual(navResult.packageHash, 'sha256-lever-hash', 'packageHash must survive');
    assert.strictEqual(navResult.recommendedProjects[0].id, project2.id);
  });

  it('3. Unknown Portal with schema.org/JobPosting JSON-LD Fallback', async () => {
    const jsonLd = {
      '@context': 'https://schema.org/',
      '@type': 'JobPosting',
      title: 'Lead Cloud Infrastructure Architect',
      description:
        'We are seeking a Lead Cloud Architect to scale AWS systems and Docker microservices with Node.js and PostgreSQL. Full-time role with benefits.',
      hiringOrganization: {
        '@type': 'Organization',
        name: 'Acme Innovations',
      },
    };

    const doc = createTestDoc({
      title: '',
      description: '',
      jsonLd,
    });

    const customUrl = 'https://acmeinnovations.ai/careers/cloud-architect';
    const result = JobDetectionEngine.evaluate(doc, customUrl);

    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.confidence, 'HIGH');
    assert.ok(result.portalMetadata.portalName.includes('JSON-LD'));
    assert.strictEqual(result.jobData.title, 'Lead Cloud Infrastructure Architect');
    assert.strictEqual(result.jobData.company, 'Acme Innovations');

    // Call backend authoritative endpoint
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      cookies: { career_hub_session: session.rawToken },
      headers: {
        'X-AiCareersHub-Extension': 'true',
      },
      payload: { job: result.jobData },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.fitAnalysis);
    assert.ok(Array.isArray(body.recommendedProjects));
    assert.strictEqual(body.recommendedProjects.length > 0, true);
  });

  it('4. Unknown Portal with Semantic DOM Fallback (Medium Confidence)', async () => {
    const doc = createTestDoc({
      title: 'Software Engineer',
      company: 'TechCorp',
      description:
        'Join our engineering team! We are hiring Software Engineers to build scalable web applications with Node.js, React, and TypeScript. 3+ years experience required.',
    });

    const genericUrl = 'https://my-company-careers.org/openings/engineer';
    const result = JobDetectionEngine.evaluate(doc, genericUrl);

    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.confidence, 'MEDIUM');
    assert.strictEqual(result.portalMetadata.portalName, 'Generic Career Portal');
    assert.strictEqual(result.portalMetadata.capabilities.automaticFieldMapping, false);
    assert.strictEqual(result.jobData.title, 'Software Engineer');
  });
});

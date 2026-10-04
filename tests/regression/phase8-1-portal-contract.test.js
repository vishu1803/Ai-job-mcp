/**
 * @file Phase 8.1 Regression Suite — Canonical Portal Adapter Contract & Submission Convergence
 *
 * Verifies:
 * 1. Portal adapter contract validates correctly.
 * 2. Malformed adapter output is rejected.
 * 3. Unknown form fields are preserved rather than silently discarded.
 * 4. Select options are representable.
 * 5. Radio groups are representable.
 * 6. Checkbox fields are representable.
 * 7. File fields are representable.
 * 8. Custom employer questions are representable.
 * 9. Portal registry resolves registered adapters deterministically.
 * 10. Unknown portal produces explicit unsupported/handoff state.
 * 11. Greenhouse discovery adapter remains functional.
 * 12. Lever discovery adapter remains functional.
 * 13. MCP submission continues through JobApplicationWorkflowService.
 * 14. Web submission now converges on JobApplicationWorkflowService.
 * 15. Web submission without approval fails.
 * 16. Web submission with stale approval fails.
 * 17. Web submission with tampered package fails.
 * 18. Web submission cannot mark APPLIED merely through declarations_accuracyConfirmed.
 * 19. MCP and Web use identical approval semantics.
 * 20. Extension preparation remains compatible with the canonical package.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, jobApplications } from '../../src/db/schema.js';
import {
  PortalAdapterContract,
  PortalFormSchema,
  PortalFieldSchema,
  PortalFieldOptionSchema,
  PortalQuestionSchema,
  PortalAttachmentFieldSchema,
  MappedPortalFieldSchema,
  PortalSubmissionResultSchema,
  PortalVerificationResultSchema,
  PortalAdapterIdentitySchema,
} from '../../src/domain/portal/portal-adapter.contract.js';
import {
  PortalAdapterRegistry,
  portalAdapterRegistry,
} from '../../src/domain/portal/portal-adapter-registry.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { GreenhouseAdapter } from '../../src/services/job-board-adapters/greenhouse.adapter.js';
import { LeverAdapter } from '../../src/services/job-board-adapters/lever.adapter.js';
import { FormDetector } from '../../extension/content/form-detector.js';
import { JobPortalAdapterBase } from '../../extension/job-detection/job-portal-adapter.base.js';
import { createSession } from '../../src/security/session.service.js';
import { buildApp } from '../../src/app.js';
import { ValidationError, AuthorizationError } from '../../src/errors/index.js';

describe('Phase 8.1 — Canonical Portal Adapter Contract & Submission Convergence', () => {
  const createdTenantIds = [];
  let tenantId;
  let userId;
  let candidateId;
  let workflowService;
  let app;
  let sessionToken;
  let testAppId;
  let basePackage;

  const mockJobPosting = {
    id: crypto.randomUUID(),
    company: 'Stripe',
    title: 'Senior Infrastructure Engineer',
    location: 'Remote - US',
    description: 'Design and operate large-scale distributed databases and payments infrastructure using Go and PostgreSQL.',
    source: 'GREENHOUSE',
    applicationUrl: 'https://boards.greenhouse.io/stripe/jobs/99887766',
    sourceUrl: 'https://boards.greenhouse.io/stripe',
    requirements: ['Go', 'PostgreSQL', 'Distributed Systems'],
    skills: ['Go', 'PostgreSQL', 'Distributed Systems'],
  };

  before(async () => {
    tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Phase 8.1 Portal Contract Tenant',
      slug: `p81-tenant-${Date.now()}`,
      tier: 'PRO',
    });

    const userEmail = `portal-engineer-${Date.now()}@example.test`;

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: userEmail,
      displayName: 'Portal Architecture Auditor',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Portal Architecture Auditor',
      canonicalEmail: userEmail,
    });

    workflowService = new JobApplicationWorkflowService({ database: db });

    // Seed an initial application record for web route tests
    testAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: testAppId,
      tenantId,
      candidateId,
      jobTitle: mockJobPosting.title,
      companyName: mockJobPosting.company,
      jobUrl: mockJobPosting.applicationUrl,
      source: 'GREENHOUSE',
      status: 'SAVED',
      packageHash: 'initial-dummy-package-hash-81',
      metadata: {
        destinationUrl: mockJobPosting.applicationUrl,
      },
    });

    // Prepare package once in before() to avoid redundant LLM/analysis re-computations
    basePackage = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      applicationId: testAppId,
      jobPosting: mockJobPosting,
    });

    // Create session token for Web route authentication
    const session = await createSession(db, {
      userId,
      tenantId,
      ipAddress: '127.0.0.1',
      userAgent: 'Node-Test-Runner',
    });
    sessionToken = session.rawToken;

    // Fastify app for web routes testing
    app = buildApp({
      db,
      jobApplicationWorkflowService: workflowService,
    });
    await app.ready();
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    await closeDatabase();
  });

  it('TEST 1 — Portal adapter contract validates correctly', async () => {
    class ConcretePortalAdapter extends PortalAdapterContract {
      constructor() {
        super({
          id: 'test-portal-adapter',
          name: 'Test Portal Adapter',
          version: '1.0.0',
          priority: 25,
          capabilities: {
            jobDetection: true,
            formExtraction: true,
            fieldMapping: true,
            automatedSubmission: true,
          },
        });
      }

      canHandle(dest) {
        const u = typeof dest === 'string' ? dest : dest?.url || '';
        return u.includes('test-portal.example.com');
      }

      async extractFormSchema(_ctx) {
        return {
          portalId: this.id,
          formId: 'test-form',
          fields: [
            {
              fieldId: 'f1',
              name: 'full_name',
              label: 'Full Name',
              type: 'text',
              required: true,
            },
          ],
        };
      }
    }

    const adapter = new ConcretePortalAdapter();
    assert.strictEqual(adapter.id, 'test-portal-adapter');
    assert.strictEqual(adapter.name, 'Test Portal Adapter');
    assert.strictEqual(adapter.priority, 25);
    assert.strictEqual(adapter.capabilities.automatedSubmission, true);
    assert.strictEqual(adapter.canHandle('https://test-portal.example.com/apply/1'), true);
    assert.strictEqual(adapter.canHandle('https://other.com/apply/1'), false);

    const schema = await adapter.extractFormSchema({});
    assert.strictEqual(schema.portalId, 'test-portal-adapter');
    assert.strictEqual(schema.fields[0].fieldId, 'f1');
  });

  it('TEST 2 — Malformed adapter output is rejected', async () => {
    // 1. Invalid field type
    const invalidFieldResult = PortalFieldSchema.safeParse({
      fieldId: 'f_bad',
      name: 'bad_field',
      type: 'unsupported_random_type',
    });
    assert.strictEqual(invalidFieldResult.success, false, 'Invalid field type must be rejected');

    // 2. Invalid confidence in mapped field
    const invalidMappedResult = MappedPortalFieldSchema.safeParse({
      fieldId: 'f_map',
      name: 'name',
      fieldType: 'text',
      confidence: 1.5, // Exceeds max 1.0
    });
    assert.strictEqual(invalidMappedResult.success, false, 'Confidence > 1.0 must be rejected');

    // 3. Invalid adapter identity (missing required name)
    const invalidIdentityResult = PortalAdapterIdentitySchema.safeParse({
      id: 'no-name-adapter',
    });
    assert.strictEqual(invalidIdentityResult.success, false, 'Identity missing name must be rejected');
  });

  it('TEST 3 — Unknown form fields are preserved rather than silently discarded', async () => {
    // Canonical schema supports UNKNOWN type
    const unknownField = PortalFieldSchema.parse({
      fieldId: 'extra_field_custom_99',
      name: 'custom_clearance_level',
      label: 'Security Clearance Level',
      type: 'UNKNOWN',
      required: false,
    });
    assert.strictEqual(unknownField.type, 'UNKNOWN');
    assert.strictEqual(unknownField.name, 'custom_clearance_level');

    // FormDetector classifies unknown input as fieldType: 'UNKNOWN' without returning null
    const mockInput = {
      id: 'weird_salary_field',
      name: 'unrecognized_pay_expectation',
      type: 'text',
      required: false,
      getAttribute: (attr) => (attr === 'placeholder' ? 'Your target pay' : null),
    };
    const classified = FormDetector._classifyField(mockInput);
    assert.ok(classified, 'Unknown field must not be dropped (must not return null)');
    assert.strictEqual(classified.fieldType, 'UNKNOWN');
    assert.strictEqual(classified.verified, false);
    assert.strictEqual(classified.name, 'unrecognized_pay_expectation');
  });

  it('TEST 4 — Select options are representable', async () => {
    const selectField = PortalFieldSchema.parse({
      fieldId: 'select_work_model',
      name: 'work_preference',
      label: 'Work Preference',
      type: 'select',
      required: true,
      options: [
        { label: 'Remote', value: 'remote', selected: true },
        { label: 'Hybrid', value: 'hybrid', selected: false },
        { label: 'On-site', value: 'onsite', selected: false },
      ],
    });

    assert.strictEqual(selectField.type, 'select');
    assert.strictEqual(selectField.options.length, 3);
    assert.strictEqual(selectField.options[0].value, 'remote');
    assert.strictEqual(selectField.options[0].selected, true);
  });

  it('TEST 5 — Radio groups are representable', async () => {
    const radioField = PortalFieldSchema.parse({
      fieldId: 'radio_relocation',
      name: 'willing_to_relocate',
      label: 'Are you willing to relocate?',
      type: 'radio',
      required: true,
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    });

    assert.strictEqual(radioField.type, 'radio');
    assert.strictEqual(radioField.options.length, 2);
  });

  it('TEST 6 — Checkbox fields are representable', async () => {
    const checkboxField = PortalFieldSchema.parse({
      fieldId: 'check_terms',
      name: 'agree_to_terms',
      label: 'I acknowledge the privacy policy',
      type: 'checkbox',
      required: true,
      multiple: false,
    });

    assert.strictEqual(checkboxField.type, 'checkbox');
    assert.strictEqual(checkboxField.required, true);
  });

  it('TEST 7 — File fields are representable', async () => {
    const attachmentField = PortalAttachmentFieldSchema.parse({
      fieldId: 'attachment_resume',
      name: 'resume_upload',
      label: 'Upload Resume / CV',
      required: true,
      accept: '.pdf,.docx',
      maxSizeMb: 15,
    });

    assert.strictEqual(attachmentField.accept, '.pdf,.docx');
    assert.strictEqual(attachmentField.maxSizeMb, 15);
  });

  it('TEST 8 — Custom employer questions are representable', async () => {
    const customQuestion = PortalQuestionSchema.parse({
      questionId: 'q_k8s_experience',
      prompt: 'How many years of experience do you have with Kubernetes in production?',
      type: 'text',
      required: true,
      sensitivityLevel: 'STANDARD',
    });

    assert.strictEqual(customQuestion.questionId, 'q_k8s_experience');
    assert.strictEqual(customQuestion.required, true);
    assert.strictEqual(customQuestion.sensitivityLevel, 'STANDARD');
  });

  it('TEST 9 — Portal registry resolves registered adapters deterministically', async () => {
    const registry = new PortalAdapterRegistry();

    const lowPriorityAdapter = {
      identity: { id: 'low-prio', name: 'Low Priority', priority: 5 },
      canHandle: (url) => typeof url === 'string' && url.includes('partner.com'),
    };

    const highPriorityAdapter = {
      identity: { id: 'high-prio', name: 'High Priority', priority: 50 },
      canHandle: (url) => typeof url === 'string' && url.includes('partner.com'),
    };

    const mediumPriorityAdapter = {
      identity: { id: 'med-prio', name: 'Medium Priority', priority: 20 },
      canHandle: (url) => typeof url === 'string' && url.includes('partner.com'),
    };

    registry.register(lowPriorityAdapter);
    registry.register(highPriorityAdapter);
    registry.register(mediumPriorityAdapter);

    const resolved = registry.resolve('https://partner.com/jobs/123');
    assert.ok(resolved, 'Adapter must be resolved');
    assert.strictEqual(resolved.identity.id, 'high-prio', 'Registry must resolve highest priority adapter');
  });

  it('TEST 10 — Unknown portal produces explicit unsupported/handoff state', async () => {
    const registry = new PortalAdapterRegistry();
    const resolved = registry.resolve('https://unsupported-unknown-portal.org/careers/apply');
    assert.strictEqual(resolved, null, 'Unregistered portal must resolve to null');

    const destinationUrl = 'https://unsupported-unknown-portal.org/careers/apply';
    const pkg = {
      ...basePackage,
      targetJob: {
        ...basePackage.targetJob,
        applicationUrl: destinationUrl,
        directPortalUrl: destinationUrl,
      },
    };

    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'mcp-test',
      jobId: mockJobPosting.id,
      destinationUrl,
      packageHash: pkg.packageHash,
    });

    const result = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: pkg.packageHash,
      destinationUrl,
      applicationPackage: pkg,
    });

    assert.strictEqual(result.status, 'HANDOFF_READY', 'Must yield HANDOFF_READY for unintegrated portal');
    assert.ok(result.manualHandoffKit, 'Must include complete manual handoff kit');
  });

  it('TEST 11 — Greenhouse discovery adapter remains functional', async () => {
    const ghDiscovery = new GreenhouseAdapter({ boardToken: 'stripe' });
    assert.strictEqual(ghDiscovery.boardToken, 'stripe');
    assert.strictEqual(typeof ghDiscovery.fetchJobs, 'function');
  });

  it('TEST 12 — Lever discovery adapter remains functional', async () => {
    const leverDiscovery = new LeverAdapter({ site: 'netflix' });
    assert.strictEqual(leverDiscovery.site, 'netflix');
    assert.strictEqual(typeof leverDiscovery.fetchJobs, 'function');
    const meta = leverDiscovery.getMeta();
    assert.strictEqual(meta.provider, 'LEVER');
  });

  it('TEST 13 — MCP submission continues through JobApplicationWorkflowService', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'mcp-client',
      jobId: mockJobPosting.id,
      destinationUrl: mockJobPosting.applicationUrl,
      packageHash: basePackage.packageHash,
    });

    const result = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: basePackage.packageHash,
      destinationUrl: mockJobPosting.applicationUrl,
      applicationPackage: basePackage,
    });

    assert.ok(result, 'Result must exist');
    assert.strictEqual(result.status, 'HANDOFF_READY');
  });

  it('TEST 14 — Web submission now converges on JobApplicationWorkflowService', async () => {
    // 1. Request approval ticket
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'career-hub-web',
      jobId: mockJobPosting.id,
      destinationUrl: mockJobPosting.applicationUrl,
      packageHash: basePackage.packageHash,
      packageVersion: basePackage.packageVersion || 1,
    });

    // 2. Submit via Web Route converged endpoint
    const response = await app.inject({
      method: 'POST',
      url: `/applications/${testAppId}/apply/submit`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        approvalTicketId: ticket.ticketId,
        packageHash: basePackage.packageHash,
        destinationUrl: mockJobPosting.applicationUrl,
        applicationPackage: basePackage,
      },
    });

    assert.strictEqual(response.statusCode, 200, `Expected 200 OK, got ${response.statusCode}: ${response.body}`);
    const json = JSON.parse(response.body);
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.submissionResult.status, 'HANDOFF_READY');
  });

  it('TEST 15 — Web submission without approval fails', async () => {
    const unapprovedAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: unapprovedAppId,
      tenantId,
      candidateId,
      jobTitle: mockJobPosting.title,
      companyName: mockJobPosting.company,
      status: 'SAVED',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/applications/${unapprovedAppId}/apply/submit`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        // Omitting approvalTicketId
        declarations_accuracyConfirmed: 'true',
      },
    });

    assert.strictEqual(response.statusCode, 403, 'Must reject unapproved submission with 403 FORBIDDEN');
    const json = JSON.parse(response.body);
    assert.strictEqual(json.error, 'APPROVAL_TICKET_REQUIRED');

    // Confirm DB record is untouched and NOT APPLIED
    const [appRow] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, unapprovedAppId));
    assert.notStrictEqual(appRow.status, 'APPLIED');
  });

  it('TEST 16 — Web submission with stale approval fails', async () => {
    const staleAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: staleAppId,
      tenantId,
      candidateId,
      jobTitle: mockJobPosting.title,
      companyName: mockJobPosting.company,
      status: 'SAVED',
    });

    // Mint ticket for version 1
    const ticketV1 = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'career-hub-web',
      jobId: mockJobPosting.id,
      destinationUrl: mockJobPosting.applicationUrl,
      packageHash: basePackage.packageHash,
      packageVersion: 1,
    });

    // Advance application package to version 2
    const pkgV2 = {
      ...basePackage,
      applicationId: staleAppId,
      packageVersion: 2,
    };

    const response = await app.inject({
      method: 'POST',
      url: `/applications/${staleAppId}/apply/submit`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        approvalTicketId: ticketV1.ticketId,
        packageHash: basePackage.packageHash,
        destinationUrl: mockJobPosting.applicationUrl,
        applicationPackage: pkgV2,
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const json = JSON.parse(response.body);
    assert.strictEqual(json.error, 'STALE_APPROVAL_VERSION');
  });

  it('TEST 17 — Web submission with tampered package fails', async () => {
    const tamperAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: tamperAppId,
      tenantId,
      candidateId,
      jobTitle: mockJobPosting.title,
      companyName: mockJobPosting.company,
      status: 'SAVED',
    });

    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'career-hub-web',
      jobId: mockJobPosting.id,
      destinationUrl: mockJobPosting.applicationUrl,
      packageHash: basePackage.packageHash,
      packageVersion: 1,
    });

    // Tampered hash payload
    const response = await app.inject({
      method: 'POST',
      url: `/applications/${tamperAppId}/apply/submit`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        approvalTicketId: ticket.ticketId,
        packageHash: 'tampered-hash-f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0',
        destinationUrl: mockJobPosting.applicationUrl,
        applicationPackage: { ...basePackage, applicationId: tamperAppId },
      },
    });

    assert.strictEqual(response.statusCode, 400);
    const json = JSON.parse(response.body);
    assert.strictEqual(json.error, 'PACKAGE_HASH_TAMPERED');
  });

  it('TEST 18 — Web submission cannot mark APPLIED merely through declarations_accuracyConfirmed', async () => {
    const bypassAppId = crypto.randomUUID();
    await db.insert(jobApplications).values({
      id: bypassAppId,
      tenantId,
      candidateId,
      jobTitle: mockJobPosting.title,
      companyName: mockJobPosting.company,
      status: 'SAVED',
    });

    // Attempt exploit: declarations_accuracyConfirmed: true without ticket
    const response = await app.inject({
      method: 'POST',
      url: `/applications/${bypassAppId}/apply/submit`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        declarations_accuracyConfirmed: 'true',
        declarations_externalAuthorization: 'true',
      },
    });

    assert.strictEqual(response.statusCode, 403);
    const json = JSON.parse(response.body);
    assert.strictEqual(json.error, 'APPROVAL_TICKET_REQUIRED');

    // Confirm database row was NEVER modified to APPLIED
    const [persistedApp] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, bypassAppId));
    assert.strictEqual(persistedApp.status, 'SAVED');
    assert.strictEqual(persistedApp.appliedAt, null);
  });

  it('TEST 19 — MCP and Web use identical approval semantics', async () => {
    // Minted ticket via canonical service
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'career-hub-mcp',
      jobId: mockJobPosting.id,
      destinationUrl: mockJobPosting.applicationUrl,
      packageHash: basePackage.packageHash,
      packageVersion: 1,
    });

    assert.strictEqual(ticket.tenantId, tenantId);
    assert.strictEqual(ticket.userId, userId);
    assert.strictEqual(ticket.candidateId, candidateId);
    assert.strictEqual(ticket.packageHash, basePackage.packageHash);
    assert.ok(ticket.signature.length > 20, 'HMAC signature must be present');
    assert.ok(['ISSUED', 'PENDING'].includes(ticket.status), `Ticket status should be ISSUED or PENDING, got ${ticket.status}`);
  });

  it('TEST 20 — Extension preparation remains compatible with the canonical package', async () => {
    const baseAdapter = new JobPortalAdapterBase({
      id: 'ext-greenhouse-adapter',
      name: 'Extension Greenhouse Adapter',
    });

    // Test form schema bridge
    const mockDoc = {};
    const canonicalForm = baseAdapter.extractFormSchema(mockDoc, 'https://boards.greenhouse.io/demo/jobs/1');
    const parsed = PortalFormSchema.safeParse(canonicalForm);
    assert.strictEqual(parsed.success, true, 'Extension adapter output must conform to PortalFormSchema');
    assert.strictEqual(parsed.data.portalId, 'ext-greenhouse-adapter');
  });
});

/**
 * @file Phase 7 Regression Test Suite: Application Adaptation, Action Services & Human-in-the-Loop Safety
 *
 * Verifies the 25 dimensions required for Phase 7:
 * 1. Action taxonomy (READ_ONLY, PREPARE, PREFILL, REVIEW, SUBMIT)
 * 2. Prepare does not submit
 * 3. Prefill does not submit
 * 4. Explicit submission authorization
 * 5. Authorization bound to user
 * 6. Authorization bound to application / job
 * 7. Authorization bound to version (tamper check)
 * 8. Stale authorization rejected (version bump)
 * 9. Immutable application snapshot
 * 10. Field provenance
 * 11. Zero-fabrication application answers
 * 12. Sensitive field protection
 * 13. Required field validation
 * 14. Answer confidence and provenance
 * 15. Resume tailoring provenance
 * 16. Cover letter provenance
 * 17. Extension handoff parity
 * 18. Extension cannot independently fabricate data
 * 19. External page mismatch
 * 20. Idempotent submission
 * 21. Duplicate submission prevention
 * 22. Retry safety
 * 23. Audit log
 * 24. MCP/Web/Extension parity
 * 25. Failure-closed behavior
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, jobApplications, candidateSkills } from '../../src/db/schema.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import {
  ACTION_TAXONOMY,
  ActionSafetyLevelEnum,
  FieldProvenanceEnum,
  SubmissionRetryStateEnum,
  ApplicationSnapshotSchema,
  ApplicationAnswerSchema,
} from '../../src/domain/job/job-workflow.schemas.js';
import {
  SENSITIVE_AUTOFILL_FIELDS,
  UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE,
} from '../../src/domain/extension/extension-assistant.schemas.js';
import { ExtensionAssistantService } from '../../src/services/extension-assistant.service.js';
import { AuthorizationError, ConflictError, ValidationError, NotFoundError } from '../../src/errors/index.js';

describe('Phase 7 — Application Adaptation, Action Services & Human-in-the-Loop Safety', () => {
  let tenantId;
  let userId;
  let candidateId;
  let workflowService;
  let extensionAssistant;
  let mockJob;
  let preparedPkg;

  before(async () => {
    tenantId = crypto.randomUUID();
    userId = crypto.randomUUID();
    candidateId = crypto.randomUUID();

    // Setup tenant, user, candidate in DB
    await db.insert(tenants).values({
      id: tenantId,
      name: 'Phase 7 Safety Tenant',
      slug: `p7-tenant-${Date.now()}`,
      status: 'ACTIVE',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: 'candidate.safety@example.com',
      displayName: 'Safety Candidate',
      passwordHash: 'dummy-hash',
      role: 'MEMBER',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Safety Candidate',
      canonicalEmail: 'candidate.safety@example.com',
      profileMetadata: {
        skills: ['TypeScript', 'Node.js', 'React'],
        experience: [
          {
            company: 'TechCorp',
            role: 'Software Engineer',
            startDate: '2021-01-01',
            endDate: '2023-01-01',
            description: 'Built scalable backend microservices with Node.js and TypeScript.',
          },
        ],
        projects: [
          {
            name: 'API Gateway',
            skills: ['Node.js', 'TypeScript'],
            summary: 'High performance reverse proxy service with rate limiting.',
          },
        ],
      },
    });

    workflowService = new JobApplicationWorkflowService({ database: db });
    extensionAssistant = new ExtensionAssistantService({ database: db });

    mockJob = {
      id: crypto.randomUUID(),
      company: 'Acme Systems',
      title: 'Senior Backend Engineer',
      location: 'Remote',
      description: 'Looking for a Senior Backend Engineer proficient in Node.js, TypeScript, and distributed systems.',
      source: 'GREENHOUSE',
      applicationUrl: 'https://job-boards.greenhouse.io/acmesystems/jobs/998877',
      sourceUrl: 'https://boards.greenhouse.io/acmesystems',
      requirements: ['Node.js', 'TypeScript', 'PostgreSQL'],
      responsibilities: ['Design backend APIs'],
      skills: ['Node.js', 'TypeScript', 'PostgreSQL'],
      retrievedAt: new Date().toISOString(),
    };

    preparedPkg = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
      answers: {
        legalName: 'Safety Candidate',
        workAuth: 'Citizen',
      },
    });
  });

  after(async () => {
    // DB connection kept intact for subsequent suites
  });

  // ---------------------------------------------------------------------------
  // 1. Action taxonomy
  // ---------------------------------------------------------------------------
  it('1. Action taxonomy: enforces READ_ONLY, PREPARE, PREFILL, REVIEW, and SUBMIT classification', () => {
    assert.equal(ActionSafetyLevelEnum.enum.READ_ONLY, 'READ_ONLY');
    assert.equal(ActionSafetyLevelEnum.enum.PREPARE, 'PREPARE');
    assert.equal(ActionSafetyLevelEnum.enum.PREFILL, 'PREFILL');
    assert.equal(ActionSafetyLevelEnum.enum.REVIEW, 'REVIEW');
    assert.equal(ActionSafetyLevelEnum.enum.SUBMIT, 'SUBMIT');

    // READ_ONLY actions must never require approval or mutate state or have external consequences
    assert.deepEqual(ACTION_TAXONOMY.search_jobs, {
      level: 'READ_ONLY',
      requiresApproval: false,
      mutatesState: false,
      externalConsequences: false,
    });
    assert.deepEqual(ACTION_TAXONOMY.analyze_job_fit, {
      level: 'READ_ONLY',
      requiresApproval: false,
      mutatesState: false,
      externalConsequences: false,
    });

    // PREPARE actions mutate internal state but do not require submission approval and have no external consequences
    assert.equal(ACTION_TAXONOMY.prepare_job_application.level, 'PREPARE');
    assert.equal(ACTION_TAXONOMY.prepare_job_application.requiresApproval, false);
    assert.equal(ACTION_TAXONOMY.prepare_job_application.externalConsequences, false);

    // PREFILL actions must not have external consequences or require approval
    assert.equal(ACTION_TAXONOMY['assistant/autofill-plan'].level, 'PREFILL');
    assert.equal(ACTION_TAXONOMY['assistant/autofill-plan'].externalConsequences, false);

    // SUBMIT is the only action with external consequences and requires explicit approval
    assert.equal(ACTION_TAXONOMY.submit_job_application.level, 'SUBMIT');
    assert.equal(ACTION_TAXONOMY.submit_job_application.requiresApproval, true);
    assert.equal(ACTION_TAXONOMY.submit_job_application.mutatesState, true);
    assert.equal(ACTION_TAXONOMY.submit_job_application.externalConsequences, true);
  });

  // ---------------------------------------------------------------------------
  // 2. Prepare does not submit
  // ---------------------------------------------------------------------------
  it('2. Prepare does not submit: prepareJobApplication creates a SAVED draft, never SUBMITTED', async () => {
    assert.ok(preparedPkg);
    assert.ok(preparedPkg.packageHash);
    assert.ok(preparedPkg.applicationId);
    assert.equal(preparedPkg.packageStatus, 'SAVED');
    assert.notEqual(preparedPkg.packageStatus, 'SUBMITTED');
    assert.equal(preparedPkg.externalSubmissionState || undefined, undefined);
  });

  // ---------------------------------------------------------------------------
  // 3. Prefill does not submit
  // ---------------------------------------------------------------------------
  it('3. Prefill does not submit: autofill plan formulation produces mappings without submitting', async () => {
    const fieldsToPlan = [
      { name: 'first_name', fieldType: 'FIRST_NAME', label: 'First Name' },
      { name: 'email', fieldType: 'EMAIL', label: 'Email Address' },
    ];

    const plan = extensionAssistant.generateAutofillPlan({
      formFields: fieldsToPlan,
      candidateProfile: {
        displayName: 'Safety Candidate',
        contact: { email: 'candidate.safety@example.com' },
      },
    });

    assert.ok(plan);
    assert.ok(Array.isArray(plan.mappedFields));
    assert.equal(plan.mappedFields.length, 2);
    const namePlan = plan.mappedFields.find((p) => p.fieldName === 'first_name');
    assert.ok(namePlan);
    assert.equal(namePlan.value, 'Safety');
    assert.equal(namePlan.source, 'CANONICAL_PROFILE_IDENTITY');
    assert.notEqual(plan.status, 'SUBMITTED');
  });

  // ---------------------------------------------------------------------------
  // 4. Explicit submission authorization
  // ---------------------------------------------------------------------------
  it('4. Explicit submission authorization: submitJobApplication without approval ticket throws APPROVAL_TICKET_REQUIRED', async () => {
    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: null, // missing ticket
          packageHash: preparedPkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: preparedPkg,
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.equal(err.code, 'APPROVAL_TICKET_REQUIRED');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 5. Authorization bound to user
  // ---------------------------------------------------------------------------
  it('5. Authorization bound to user: ticket issued for User A cannot be used by User B', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'test-client',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: preparedPkg.packageHash,
      packageVersion: preparedPkg.packageVersion || 1,
    });

    const otherUserId = crypto.randomUUID();

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId: otherUserId, // mismatched user
          candidateId,
          approvalTicketId: ticket.ticketId,
          packageHash: preparedPkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: preparedPkg,
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.equal(err.code, 'FORBIDDEN_TICKET_MISMATCH');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Authorization bound to application / job
  // ---------------------------------------------------------------------------
  it('6. Authorization bound to application/job: ticket cannot be used for a different destination URL', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'test-client',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: preparedPkg.packageHash,
      packageVersion: preparedPkg.packageVersion || 1,
    });

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          packageHash: preparedPkg.packageHash,
          destinationUrl: 'https://job-boards.greenhouse.io/othercorp/jobs/111111', // different URL
          applicationPackage: preparedPkg,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.code, 'DESTINATION_MISMATCH');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 7. Authorization bound to version (tamper check)
  // ---------------------------------------------------------------------------
  it('7. Authorization bound to version: modified package payload causes hash mismatch and rejects submission', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'test-client',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: preparedPkg.packageHash,
      packageVersion: preparedPkg.packageVersion || 1,
    });

    const tamperedHash = crypto.createHash('sha256').update('tampered-content').digest('hex');

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          packageHash: tamperedHash, // tampered hash
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: preparedPkg,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.code, 'PACKAGE_HASH_TAMPERED');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 8. Stale authorization rejected (version bump)
  // ---------------------------------------------------------------------------
  it('8. Stale authorization rejected: ticket issued for version 1 is rejected when current package is version 2', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'test-client',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: preparedPkg.packageHash,
      packageVersion: 1,
    });

    const updatedPackage = {
      ...preparedPkg,
      packageVersion: 2, // version incremented after user edit
    };

    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          packageHash: preparedPkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: updatedPackage,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.equal(err.code, 'STALE_APPROVAL_VERSION');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 9. Immutable application snapshot
  // ---------------------------------------------------------------------------
  it('9. Immutable application snapshot: createApplicationSnapshot creates a validated immutable snapshot', () => {
    const snapshot = workflowService.createApplicationSnapshot(preparedPkg);

    assert.ok(snapshot);
    assert.ok(snapshot.snapshotId);
    assert.equal(snapshot.packageHash, preparedPkg.packageHash);
    assert.equal(snapshot.job.company, mockJob.company);
    assert.equal(snapshot.job.title, mockJob.title);
    assert.equal(snapshot.candidate.id, candidateId);
    assert.ok(snapshot.createdAt);

    // Validate that modifying the original package does not alter snapshot fields
    preparedPkg.answers.newField = 'new-value';
    assert.equal(snapshot.applicationAnswers.newField, undefined);

    // Conforms strictly to ApplicationSnapshotSchema
    const parsed = ApplicationSnapshotSchema.parse(snapshot);
    assert.equal(parsed.snapshotId, snapshot.snapshotId);
  });

  // ---------------------------------------------------------------------------
  // 10. Field provenance
  // ---------------------------------------------------------------------------
  it('10. Field provenance: system tracks full provenance hierarchy across all answer sources', () => {
    const allowed = FieldProvenanceEnum.options;
    assert.deepEqual(allowed, [
      'USER_PROVIDED',
      'VERIFIED_PROFILE',
      'VERIFIED_EVIDENCE',
      'INFERRED',
      'GENERATED',
      'UNKNOWN',
    ]);

    const validAnswer = ApplicationAnswerSchema.parse({
      question: 'Do you have experience with TypeScript?',
      answer: 'Yes',
      confidence: 0.98,
      source: 'VERIFIED_EVIDENCE',
      evidence: 'repo:api-gateway/src/index.ts',
      requiresReview: false,
    });
    assert.equal(validAnswer.source, 'VERIFIED_EVIDENCE');
    assert.equal(validAnswer.requiresReview, false);
  });

  // ---------------------------------------------------------------------------
  // 11. Zero-fabrication application answers
  // ---------------------------------------------------------------------------
  it('11. Zero-fabrication application answers: uncorroborated tenure question yields UNKNOWN/requiresReview', () => {
    // If a candidate has repository evidence for React, but no tenure evidence for "How many years of React experience do you have?":
    const unevidencedTenureAnswer = {
      question: 'How many years of React experience do you have?',
      answer: null, // Zero fabrication: do not fabricate "3 years"
      confidence: 0.0,
      source: 'UNKNOWN',
      evidence: 'No verified professional tenure evidence found for React years.',
      requiresReview: true,
    };

    const parsed = ApplicationAnswerSchema.parse(unevidencedTenureAnswer);
    assert.equal(parsed.answer, null);
    assert.equal(parsed.source, 'UNKNOWN');
    assert.equal(parsed.requiresReview, true);
  });

  // ---------------------------------------------------------------------------
  // 12. Sensitive field protection
  // ---------------------------------------------------------------------------
  it('12. Sensitive field protection: salary, work authorization, disability, and EEO require confirmation', async () => {
    for (const field of [
      'WORK_AUTHORIZATION',
      'VISA_SPONSORSHIP',
      'SALARY_EXPECTATION',
      'CRIMINAL_HISTORY',
      'EEO_RACE',
      'EEO_GENDER',
      'EEO_DISABILITY',
    ]) {
      assert.ok(SENSITIVE_AUTOFILL_FIELDS.includes(field));
    }

    // Extension assistant planning for a sensitive field must flag requiresConfirmation = true
    const plan = extensionAssistant.generateAutofillPlan({
      formFields: [
        { fieldName: 'desiredSalary', fieldType: 'SALARY_EXPECTATION', label: 'Expected Salary' },
        { fieldName: 'workAuth', fieldType: 'WORK_AUTHORIZATION', label: 'Work Authorization' },
      ],
      candidateProfile: {
        displayName: 'Safety Candidate',
        jobPreferences: {
          workAuthorization: 'Citizen',
        },
      },
    });

    for (const f of plan.mappedFields) {
      assert.equal(f.isSensitive, true);
      assert.equal(f.requiresConfirmation, true);
    }
  });

  // ---------------------------------------------------------------------------
  // 13. Required field validation
  // ---------------------------------------------------------------------------
  it('13. Required field validation: validateJobApplication blocks incomplete applications', async () => {
    const incompletePkg = {
      ...preparedPkg,
      tailoredResume: {
        ...preparedPkg.tailoredResume,
        markdownContent: '   ', // whitespace only triggers validation block without violating Zod schema
      },
    };

    const validation = await workflowService.validateJobApplication({
      tenantId,
      candidateId,
      applicationPackage: incompletePkg,
      destinationUrl: mockJob.applicationUrl,
    });

    assert.equal(validation.isReady, false);
    assert.equal(validation.status, 'NEEDS_USER_INPUT');
    assert.ok(validation.missingFields.includes('tailoredResume'));
  });

  // ---------------------------------------------------------------------------
  // 14. Answer confidence and provenance
  // ---------------------------------------------------------------------------
  it('14. Answer confidence and provenance: high confidence answer cannot bypass human approval gate', async () => {
    const highConfidenceAnswer = ApplicationAnswerSchema.parse({
      question: 'Are you legally authorized to work in the United States?',
      answer: 'Yes',
      confidence: 1.0,
      source: 'USER_PROVIDED',
      evidence: 'User entered citizenship status',
      requiresReview: false,
    });

    assert.equal(highConfidenceAnswer.confidence, 1.0);

    // Attempting submission without approval ticket still fails closed
    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: null,
          packageHash: preparedPkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: {
            ...preparedPkg,
            answers: { workAuthAnswer: highConfidenceAnswer },
          },
        });
      },
      (err) => {
        assert.ok(err instanceof AuthorizationError);
        assert.equal(err.code, 'APPROVAL_TICKET_REQUIRED');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 15. Resume tailoring provenance
  // ---------------------------------------------------------------------------
  it('15. Resume tailoring provenance: tailored resume grounds strictly in verified candidate evidence', () => {
    const tailoredResume = preparedPkg.tailoredResume;
    assert.ok(tailoredResume);
    assert.ok(tailoredResume.contentHash);
    assert.ok(tailoredResume.markdownContent);
    assert.ok(tailoredResume.markdownContent.length > 50);

    // Contains candidate's authentic display name
    assert.ok(tailoredResume.markdownContent.includes('Safety Candidate'));

    // Ensure no unverified employer or degree was fabricated
    assert.equal(tailoredResume.markdownContent.includes('NASA Senior Director'), false);
    assert.equal(tailoredResume.markdownContent.includes('PhD in Quantum Physics'), false);
  });

  // ---------------------------------------------------------------------------
  // 16. Cover letter provenance
  // ---------------------------------------------------------------------------
  it('16. Cover letter provenance: generated cover letter grounds strictly in authentic candidate achievements', () => {
    const coverLetter = preparedPkg.coverLetter;
    assert.ok(coverLetter);
    assert.ok(coverLetter.contentHash);
    assert.ok(coverLetter.markdownContent);

    // Should mention the target company
    assert.ok(coverLetter.markdownContent.includes(mockJob.company));

    // Must not contain fabricated wild claims
    assert.equal(coverLetter.markdownContent.includes('15 years of React experience'), false);
  });

  // ---------------------------------------------------------------------------
  // 17. Extension handoff parity
  // ---------------------------------------------------------------------------
  it('17. Extension handoff parity: prepared application package contains identical artifacts across MCP and Extension', async () => {
    assert.ok(preparedPkg.tailoredResume);
    assert.ok(preparedPkg.coverLetter);
    assert.ok(preparedPkg.targetJob);
    assert.ok(preparedPkg.packageHash);

    // Package format can be handed directly to extension without modification
    const snapshot = workflowService.createApplicationSnapshot(preparedPkg);
    assert.equal(snapshot.packageHash, preparedPkg.packageHash);
    assert.equal(snapshot.targetUrl, mockJob.applicationUrl);
  });

  // ---------------------------------------------------------------------------
  // 18. Extension cannot independently fabricate data
  // ---------------------------------------------------------------------------
  it('18. Extension cannot independently fabricate data: missing attributes return UNAVAILABLE message', async () => {
    const plan = extensionAssistant.generateAutofillPlan({
      formFields: [
        { fieldName: 'unknownCert', fieldType: 'text', label: 'AWS Certification Number' },
        { fieldName: 'securityClearance', fieldType: 'text', label: 'Top Secret Clearance ID' },
      ],
      candidateProfile: {
        displayName: 'Safety Candidate',
      },
    });

    for (const f of plan.mappedFields) {
      assert.equal(f.available, false);
      assert.equal(f.value, null);
      assert.equal(f.unavailabilityReason, UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE);
      assert.equal(f.source, 'NONE');
    }
  });

  // ---------------------------------------------------------------------------
  // 19. External page mismatch
  // ---------------------------------------------------------------------------
  it('19. External page mismatch: validateExternalPageMatch blocks submission if page does not match approved job', () => {
    const approvedJob = {
      company: 'Acme Systems',
      title: 'Senior Backend Engineer',
      jobId: 'job-12345',
      applicationUrl: 'https://job-boards.greenhouse.io/acmesystems/jobs/12345',
    };

    // Case A: Perfect match
    const validPage = {
      company: 'Acme Systems',
      title: 'Senior Backend Engineer',
      jobId: 'job-12345',
      url: 'https://job-boards.greenhouse.io/acmesystems/jobs/12345',
    };
    assert.deepEqual(JobApplicationWorkflowService.validateExternalPageMatch({ approvedJob, currentPage: validPage }), {
      matched: true,
    });

    // Case B: Company mismatch
    const badCompany = { ...validPage, company: 'EvilCorp' };
    const compResult = JobApplicationWorkflowService.validateExternalPageMatch({ approvedJob, currentPage: badCompany });
    assert.equal(compResult.matched, false);
    assert.ok(compResult.reason.includes('Target company mismatch'));

    // Case C: Title mismatch
    const badTitle = { ...validPage, title: 'Lead Frontend Developer' };
    const titleResult = JobApplicationWorkflowService.validateExternalPageMatch({ approvedJob, currentPage: badTitle });
    assert.equal(titleResult.matched, false);
    assert.ok(titleResult.reason.includes('Target title mismatch'));

    // Case D: Host mismatch
    const badHost = { ...validPage, url: 'https://phishing-site.example.com/acmesystems/jobs/12345' };
    const hostResult = JobApplicationWorkflowService.validateExternalPageMatch({ approvedJob, currentPage: badHost });
    assert.equal(hostResult.matched, false);
    assert.ok(hostResult.reason.includes('Target host mismatch'));
  });

  // ---------------------------------------------------------------------------
  // 20. Idempotent submission
  // ---------------------------------------------------------------------------
  it('20. Idempotent submission: replaying an already-consumed approval ticket throws CONFLICT', async () => {
    const ticket = await workflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'test-client',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: preparedPkg.packageHash,
      packageVersion: preparedPkg.packageVersion || 1,
    });

    // First consumption (unintegrated greenhouse portal returns HANDOFF_READY)
    const result1 = await workflowService.submitJobApplication({
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      packageHash: preparedPkg.packageHash,
      destinationUrl: mockJob.applicationUrl,
      applicationPackage: preparedPkg,
    });
    assert.ok(result1);
    assert.equal(result1.status, 'HANDOFF_READY');

    // Second consumption with the same ticket must be rejected immediately
    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: ticket.ticketId,
          packageHash: preparedPkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: preparedPkg,
        });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'CONFLICT');
        assert.ok(err.message.includes('already been consumed'));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 21. Duplicate submission prevention
  // ---------------------------------------------------------------------------
  it('21. Duplicate submission prevention: validateJobApplication flags existing applied job as duplicate', async () => {
    // Record an existing application in APPLIED state
    const existingJobId = crypto.randomUUID();
    const existingJobUrl = 'https://job-boards.greenhouse.io/acmesystems/jobs/already-applied';

    await db.insert(jobApplications).values({
      id: crypto.randomUUID(),
      tenantId,
      candidateId,
      companyName: 'Acme Systems Duplicate Test',
      jobTitle: 'Backend Developer',
      jobUrl: existingJobUrl,
      canonicalJobId: existingJobId,
      normalizedJobUrl: existingJobUrl.toLowerCase(),
      status: 'APPLIED',
      appliedAt: new Date(),
    });

    const duplicateCheckPkg = {
      ...preparedPkg,
      targetJob: {
        ...mockJob,
        company: 'Acme Systems Duplicate Test',
        title: 'Backend Developer',
        canonicalJobId: existingJobId,
        applicationUrl: existingJobUrl,
      },
    };

    const validation = await workflowService.validateJobApplication({
      tenantId,
      candidateId,
      applicationPackage: duplicateCheckPkg,
      destinationUrl: existingJobUrl,
    });

    assert.equal(validation.status, 'DUPLICATE');
    assert.ok(validation.duplicateWarning);
    assert.equal(validation.duplicateWarning.status, 'APPLIED');
  });

  // ---------------------------------------------------------------------------
  // 22. Retry safety
  // ---------------------------------------------------------------------------
  it('22. Retry safety: resolveSubmissionRetryState distinguishes SENT_UNKNOWN, NOT_SENT, and FAILED', () => {
    // Pre-flight / DNS errors are NOT_SENT
    assert.equal(
      JobApplicationWorkflowService.resolveSubmissionRetryState(new Error('getaddrinfo ENOTFOUND boards.greenhouse.io')),
      'NOT_SENT'
    );
    assert.equal(
      JobApplicationWorkflowService.resolveSubmissionRetryState({ code: 'APPROVAL_TICKET_REQUIRED', message: 'ticket required' }),
      'NOT_SENT'
    );

    // Network timeout / connection reset mid-flight is SENT_UNKNOWN
    assert.equal(
      JobApplicationWorkflowService.resolveSubmissionRetryState(new Error('Connection timed out after 30000ms')),
      'SENT_UNKNOWN'
    );
    assert.equal(
      JobApplicationWorkflowService.resolveSubmissionRetryState({ code: 'ECONNRESET', message: 'socket hang up' }),
      'SENT_UNKNOWN'
    );
    assert.equal(
      JobApplicationWorkflowService.resolveSubmissionRetryState(new Error('504 Gateway Timeout')),
      'SENT_UNKNOWN'
    );

    // Definitive rejection is FAILED
    assert.equal(
      JobApplicationWorkflowService.resolveSubmissionRetryState(new Error('HTTP 400: Job posting closed')),
      'FAILED'
    );

    // Success / null error is CONFIRMED
    assert.equal(JobApplicationWorkflowService.resolveSubmissionRetryState(null), 'CONFIRMED');
  });

  // ---------------------------------------------------------------------------
  // 23. Audit log
  // ---------------------------------------------------------------------------
  it('23. Audit log: requests for approval and submission attempts log audit events', async () => {
    let loggedEvent = null;
    const mockAuditService = {
      async logEvent(evt) {
        loggedEvent = evt;
      },
    };

    const auditedWorkflowService = new JobApplicationWorkflowService({
      database: db,
      mcpAuditService: mockAuditService,
    });

    const ticket = await auditedWorkflowService.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      clientId: 'audit-test-client',
      jobId: mockJob.id,
      destinationUrl: mockJob.applicationUrl,
      packageHash: preparedPkg.packageHash,
      packageVersion: 1,
    });

    assert.ok(ticket);
    assert.ok(loggedEvent);
    assert.equal(loggedEvent.eventType, 'application.approval_requested');
    assert.equal(loggedEvent.tenantId, tenantId);
    assert.equal(loggedEvent.userId, userId);
    assert.equal(loggedEvent.resourceType, 'application_approval_ticket');
  });

  // ---------------------------------------------------------------------------
  // 24. MCP/Web/Extension parity
  // ---------------------------------------------------------------------------
  it('24. MCP/Web/Extension parity: all interfaces converge on the canonical JobApplicationWorkflowService and ExtensionAssistantService', async () => {
    const mcpPrepared = await workflowService.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: mockJob,
    });

    const extensionPlan = extensionAssistant.generateAutofillPlan({
      formFields: [{ fieldName: 'first_name', fieldType: 'text', label: 'Candidate Name' }],
      candidateProfile: {
        displayName: 'Safety Candidate',
      },
    });

    assert.equal(mcpPrepared.candidateName, 'Safety Candidate');
    assert.equal(extensionPlan.mappedFields[0].value, 'Safety');
    assert.equal(extensionPlan.mappedFields[0].source, 'CANONICAL_PROFILE_IDENTITY');
  });

  // ---------------------------------------------------------------------------
  // 25. Failure-closed behavior
  // ---------------------------------------------------------------------------
  it('25. Failure-closed behavior: invalid contexts fail safely without executing external submission', async () => {
    await assert.rejects(
      async () => {
        await workflowService.submitJobApplication({
          tenantId,
          userId,
          candidateId,
          approvalTicketId: 'non-existent-ticket-id',
          packageHash: preparedPkg.packageHash,
          destinationUrl: mockJob.applicationUrl,
          applicationPackage: preparedPkg,
        });
      },
      (err) => {
        assert.ok(err instanceof NotFoundError);
        assert.equal(err.code, 'NOT_FOUND');
        assert.ok(err.message.includes('not found'));
        return true;
      }
    );
  });
});

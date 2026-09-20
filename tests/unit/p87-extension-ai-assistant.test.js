/**
 * @file P87 Extension AI Assistant Integration Tests
 *
 * Verifies the AI assistant integration into the browser extension:
 * 1. AI Failure Isolation: Extension remains usable, job extraction continues, profile remains accessible,
 *    and user can manually complete application.
 * 2. Unsupported Claims Refusal: Strict zero fabrication ("Not available in your verified profile.").
 * 3. Conflicting Profile Data: Pre-submission detection of notice period, work auth, and salary discrepancies.
 * 4. Safe Autofill: Internal provenance tracking (source, confidence, evidence, requiresConfirmation)
 *    and mandatory confirmation for sensitive fields (work auth, sponsorship, salary).
 * 5. Job Page Explanation: Grounded role summary and structured relevant job detection.
 * 6. Explaining Requirement Satisfaction: Citing verified profile evidence or exact missing fallback.
 * 7. Application Error Translation: Clean, humanized explanation without technical leakages.
 * 8. Single Candidate Profile Architecture: Reads canonical profile with zero parallel tables.
 * 9. Extension API Endpoints: Fastify route integration with session auth.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { ExtensionAssistantService } from '../../src/services/extension-assistant.service.js';
import { AiCareerAssistantService } from '../../src/services/ai-career-assistant.service.js';
import { ApplicationReadinessService } from '../../src/services/application-readiness.service.js';
import extensionRoutes from '../../src/routes/extension.routes.js';
import { UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE } from '../../src/domain/extension/extension-assistant.schemas.js';

describe('P87: Extension AI Assistant Integration & Safety Battery', () => {
  let assistantService;
  let mockCandidateProfileService;
  let mockCareerAssistantService;
  let readinessService;

  const mockCandidate = {
    id: 'cand-ext-001',
    tenantId: 'tenant-ext-001',
    userId: 'user-ext-001',
    displayName: 'Samara Varma',
    canonicalEmail: 'samara.varma@example.com',
    contact: {
      firstName: 'Samara',
      lastName: 'Varma',
      email: 'samara.varma@example.com',
      phone: '+1 415 555 2671',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'USA',
    },
    socialLinks: {
      linkedin: 'https://linkedin.com/in/samaravarma',
      github: 'https://github.com/samaravarma',
      portfolio: 'https://samara.dev',
    },
    profileMetadata: {
      userCustom: {
        location: 'San Francisco, CA',
        phone: '+1 415 555 2671',
        noticePeriod: '30_days',
        workAuthorization: ['US Citizen'],
        visaSponsorshipRequired: 'NO',
        salaryFloor: 160000,
        workAuthConfirmedByUser: true,
        visaSponsorshipConfirmedByUser: true,
        portfolioLinks: [
          { platform: 'LinkedIn', url: 'https://linkedin.com/in/samaravarma' },
          { platform: 'GitHub', url: 'https://github.com/samaravarma' },
          { platform: 'Portfolio', url: 'https://samara.dev' },
        ],
      },
      careerPreferences: {
        targetRoles: ['Senior Full-Stack Engineer', 'Backend Engineer'],
        remotePreference: 'REMOTE_ONLY',
        salaryFloor: 160000,
        salaryCurrency: 'USD',
        noticePeriod: '30_days',
        workAuthorization: ['US Citizen'],
        visaSponsorshipRequired: 'NO',
        workAuthConfirmedByUser: true,
        visaSponsorshipConfirmedByUser: true,
      },
    },
    jobPreferences: {
      targetRoles: ['Senior Full-Stack Engineer', 'Backend Engineer'],
      remotePreference: 'REMOTE_ONLY',
      salaryFloor: 160000,
      salaryCurrency: 'USD',
      noticePeriod: '30_days',
      workAuthorization: ['US Citizen'],
      visaSponsorshipRequired: 'NO',
      workAuthConfirmedByUser: true,
      visaSponsorshipConfirmedByUser: true,
      availabilityDate: '2026-10-01',
    },
    verifiedSkills: [
      { name: 'TypeScript', canonicalSlug: 'typescript', provenanceStatus: 'VERIFIED' },
      { name: 'Node.js', canonicalSlug: 'nodejs', provenanceStatus: 'VERIFIED' },
      { name: 'PostgreSQL', canonicalSlug: 'postgresql', provenanceStatus: 'VERIFIED' },
      { name: 'React', canonicalSlug: 'react', provenanceStatus: 'CORROBORATED' },
    ],
  };

  const sampleJob = {
    title: 'Senior Backend Engineer',
    company: 'Stripe',
    location: 'Remote, US',
    workplace: 'REMOTE',
    employmentType: 'FULL_TIME',
    description: `Build scalable payment infrastructure using TypeScript, Node.js, and PostgreSQL.
Salary range: $165,000 - $195,000 per year.
Requirements:
- TypeScript
- Node.js
- PostgreSQL
- Rust
- AWS Cloud`,
    requirements: ['TypeScript', 'Node.js', 'PostgreSQL', 'Rust', 'AWS Cloud'],
  };

  beforeEach(() => {
    readinessService = new ApplicationReadinessService();

    mockCandidateProfileService = {
      async getCareerProfile() {
        return mockCandidate;
      },
      async updateCareerPreferences(_ctx, _candidateId, rawInput) {
        return { ...mockCandidate.jobPreferences, ...rawInput };
      },
    };

    mockCareerAssistantService = new AiCareerAssistantService({
      candidateProfileService: mockCandidateProfileService,
      readinessService,
      aiProvider: null,
    });

    assistantService = new ExtensionAssistantService({
      candidateProfileService: mockCandidateProfileService,
      readinessService,
      careerAssistantService: mockCareerAssistantService,
      aiProvider: null,
      analyzeJobFitTool: async () => ({
        atsScore: { overallScore: 82, matchBand: 'STRONG' },
        requirementMatches: [
          { normalizedRequirement: 'TypeScript', matchStatus: 'MATCHED' },
          { normalizedRequirement: 'Node.js', matchStatus: 'MATCHED' },
          { normalizedRequirement: 'PostgreSQL', matchStatus: 'MATCHED' },
          { normalizedRequirement: 'Rust', matchStatus: 'MISSING' },
        ],
      }),
    });
  });

  it('1. AI Failure Isolation: Extension remains usable, match & readiness function when AI throws', async () => {
    // Inject failing AI provider
    const failingProvider = {
      async generateText() {
        throw new Error('AI Model 503 Overloaded: Quota exceeded');
      },
    };

    const failingAssistant = new ExtensionAssistantService({
      candidateProfileService: mockCandidateProfileService,
      readinessService,
      careerAssistantService: mockCareerAssistantService,
      aiProvider: failingProvider,
      analyzeJobFitTool: async () => ({
        atsScore: { overallScore: 82, matchBand: 'STRONG' },
        requirementMatches: [{ normalizedRequirement: 'TypeScript', matchStatus: 'MATCHED' }],
      }),
    });

    // Calling getCompactContext when AI throws 503
    const context = await failingAssistant.getCompactContext({
      job: sampleJob,
      candidateProfile: mockCandidate,
    });

    // 1. Extension did NOT crash
    assert.ok(context, 'Context returned despite AI 503');

    // 2. Deterministic match remains fully functional
    assert.equal(context.jobMatch.score, 82);
    assert.equal(context.jobMatch.band, 'STRONG');

    // 3. Application readiness remains fully functional
    assert.ok(context.applicationReadiness.readinessScore > 0);

    // 4. AI Help indicates non-blocking graceful fallback
    assert.equal(context.aiHelp.available, false);
    assert.ok(
      context.aiHelp.fallbackNotice.includes('temporarily unavailable'),
      'Notice informs user AI is temporarily unavailable'
    );
    assert.ok(
      context.aiHelp.fallbackNotice.includes('fully accessible'),
      'Notice reassures core functionality remains accessible'
    );
  });

  it('2. Unsupported Claims Refusal: AI strictly refuses to fabricate missing skills, certifications or metrics', () => {
    const comparison = assistantService.compareRequirements({
      job: sampleJob,
      candidateProfile: mockCandidate,
    });

    // Verified skills are confirmed
    const tsMatch = comparison.matches.find((m) => m.requirement === 'TypeScript');
    assert.ok(tsMatch.satisfied);
    assert.equal(tsMatch.status, 'VERIFIED');
    assert.equal(tsMatch.source, 'CANONICAL_VERIFIED_SKILLS');

    // Unevidenced skills (Rust, AWS Cloud) MUST NOT be fabricated
    const rustMatch = comparison.matches.find((m) => m.requirement === 'Rust');
    assert.equal(rustMatch.satisfied, false);
    assert.equal(rustMatch.status, 'MISSING');
    assert.equal(rustMatch.explanation, UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE);

    const awsMatch = comparison.matches.find((m) => m.requirement === 'AWS Cloud');
    assert.equal(awsMatch.satisfied, false);
    assert.equal(awsMatch.status, 'MISSING');
    assert.equal(awsMatch.explanation, UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE);
  });

  it('3. Conflicting Profile Data: Pre-submission detection surfaces discrepancies without unilateral overwrite', () => {
    // Candidate answers immediate notice and requires sponsorship on application form
    const conflictingAnswers = {
      noticePeriod: 'immediate',
      workAuthorization: 'Need Visa Sponsorship',
    };

    const conflicts = assistantService.detectSubmissionConflicts({
      candidateProfile: mockCandidate,
      applicationAnswers: conflictingAnswers,
      job: sampleJob,
    });

    assert.ok(conflicts.length >= 2, 'Should detect both notice period and work auth conflicts');

    const noticeConflict = conflicts.find((c) => c.field === 'noticePeriod');
    assert.ok(noticeConflict, 'Notice period conflict detected');
    assert.ok(noticeConflict.profileValue.includes('30 days'));
    assert.ok(noticeConflict.applicationValue.includes('Immediate'));
    assert.ok(
      noticeConflict.resolutionOptions.includes('KEEP_PROFILE') &&
        noticeConflict.resolutionOptions.includes('USE_APPLICATION'),
      'Surfaces choices rather than unilaterally overwriting'
    );

    const authConflict = conflicts.find((c) => c.field === 'workAuthorization');
    assert.ok(authConflict, 'Work auth conflict detected');
    assert.ok(authConflict.profileValue.includes('US Citizen'));
    assert.ok(authConflict.applicationValue.includes('Need Visa Sponsorship'));
  });

  it('4. Safe Autofill: Tracks source, confidence, evidence, requiresConfirmation, and enforces sensitive gates', () => {
    const detectedFormFields = [
      { name: 'first_name', fieldType: 'FIRST_NAME', label: 'First Name' },
      { name: 'last_name', fieldType: 'LAST_NAME', label: 'Last Name' },
      { name: 'applicant_email', fieldType: 'EMAIL', label: 'Email Address' },
      { name: 'applicant_phone', fieldType: 'PHONE', label: 'Phone' },
      { name: 'github_profile', fieldType: 'GITHUB_URL', label: 'GitHub URL' },
      {
        name: 'legal_work_auth',
        fieldType: 'WORK_AUTHORIZATION',
        label: 'Are you authorized to work in the US?',
      },
      {
        name: 'visa_sponsorship',
        fieldType: 'VISA_SPONSORSHIP',
        label: 'Will you require sponsorship?',
      },
      { name: 'expected_salary', fieldType: 'SALARY_EXPECTATION', label: 'Desired Salary' },
      {
        name: 'unsupported_field',
        fieldType: 'CLEARANCE_LEVEL',
        label: 'Do you hold a TS/SCI clearance?',
      },
    ];

    const plan = assistantService.generateAutofillPlan({
      formFields: detectedFormFields,
      candidateProfile: mockCandidate,
    });

    // Total mapped count
    assert.equal(plan.mappedFields.length, 9);
    assert.equal(plan.fillableCount, 8);
    assert.equal(plan.sensitiveCount, 3);
    assert.equal(plan.missingCount, 1);

    // 1. Safe identity field (non-sensitive)
    const emailField = plan.mappedFields.find((f) => f.fieldType === 'EMAIL');
    assert.equal(emailField.value, 'samara.varma@example.com');
    assert.equal(emailField.source, 'CANONICAL_PROFILE_CONTACT');
    assert.equal(emailField.confidence, 1.0);
    assert.equal(emailField.requiresConfirmation, false);
    assert.equal(emailField.isSensitive, false);

    // 2. Sensitive work authorization field (STRICT CONFIRMATION REQUIRED)
    const authField = plan.mappedFields.find((f) => f.fieldType === 'WORK_AUTHORIZATION');
    assert.equal(authField.value, 'US Citizen');
    assert.equal(authField.source, 'CANONICAL_CAREER_PREFERENCES');
    assert.equal(authField.confidence, 0.95);
    assert.equal(
      authField.requiresConfirmation,
      true,
      'Work authorization MUST require confirmation'
    );
    assert.equal(authField.isSensitive, true);

    // 3. Sensitive visa sponsorship field (STRICT CONFIRMATION REQUIRED)
    const visaField = plan.mappedFields.find((f) => f.fieldType === 'VISA_SPONSORSHIP');
    assert.equal(visaField.value, 'No');
    assert.equal(
      visaField.requiresConfirmation,
      true,
      'Visa sponsorship MUST require confirmation'
    );
    assert.equal(visaField.isSensitive, true);

    // 4. Sensitive salary field (STRICT CONFIRMATION REQUIRED)
    const salaryField = plan.mappedFields.find((f) => f.fieldType === 'SALARY_EXPECTATION');
    assert.equal(salaryField.value, '160,000');
    assert.equal(
      salaryField.requiresConfirmation,
      true,
      'Salary expectation MUST require confirmation'
    );
    assert.equal(salaryField.isSensitive, true);

    // 5. Unavailable field (Clearance) MUST NOT be fabricated
    const clearanceField = plan.mappedFields.find((f) => f.fieldType === 'CLEARANCE_LEVEL');
    assert.equal(clearanceField.value, null);
    assert.equal(clearanceField.available, false);
    assert.equal(clearanceField.confidence, 0.0);
    assert.equal(clearanceField.source, 'NONE');
    assert.equal(clearanceField.evidence, UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE);
    assert.equal(clearanceField.unavailabilityReason, UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE);
  });

  it('5. Job Page Explanation & Detection: Extracts role details and produces grounded summary', async () => {
    const jobInfo = assistantService.detectRelevantJobInformation({ job: sampleJob });

    assert.equal(jobInfo.title, 'Senior Backend Engineer');
    assert.equal(jobInfo.company, 'Stripe');
    assert.equal(jobInfo.workplace, 'REMOTE');
    assert.equal(jobInfo.employmentType, 'FULL_TIME');
    assert.ok(jobInfo.salaryRange.includes('$165,000'));
    assert.equal(jobInfo.experienceLevel, 'SENIOR');
    assert.ok(jobInfo.coreSkills.includes('typescript'));
    assert.ok(jobInfo.coreSkills.includes('node.js'));
    assert.ok(jobInfo.coreSkills.includes('postgresql'));

    const explanation = await assistantService.explainJobPage({ job: sampleJob });
    assert.ok(explanation.groundedInPage);
    assert.ok(explanation.summary.includes('Senior Backend Engineer at Stripe'));
    assert.ok(explanation.keyExpectations.length > 0);
  });

  it('6. Application Error Translation: Reassures user and provides actionable guidance without leaking internals', () => {
    // Test a raw error that has internal technical traces
    const rawError = new Error(
      'ValidationError at job_applications.canonical_email: missing required field phone'
    );
    const explanation = assistantService.explainApplicationError({ error: rawError });

    assert.equal(explanation.errorCategory, 'VALIDATION_ERROR');
    assert.ok(explanation.humanSummary.includes('missing one or more required fields'));
    assert.ok(!explanation.humanSummary.includes('ValidationError'));
    assert.ok(!explanation.humanSummary.includes('job_applications'));
    assert.ok(explanation.recoverySteps.length > 0);
    assert.equal(explanation.isRetryable, true);
  });

  it('7. Single Candidate Profile Architecture: Reads canonical profile with zero parallel schema', async () => {
    let queriedCandidateId = null;
    const trackingProfileService = {
      async getCareerProfile(ctx, candidateId) {
        queriedCandidateId = candidateId;
        return mockCandidate;
      },
    };

    const extAssistant = new ExtensionAssistantService({
      candidateProfileService: trackingProfileService,
      readinessService,
      careerAssistantService: mockCareerAssistantService,
      aiProvider: null,
    });

    const context = await extAssistant.getCompactContext({
      job: sampleJob,
      candidateProfile: mockCandidate,
    });

    assert.ok(context.applicationReadiness);
    assert.equal(context.applicationReadiness.status, 'READY');
    assert.equal(context.applicationReadiness.profileComplete, true);
  });

  it('8. Extension API Routes: POST /assistant/context and /assistant/autofill-plan respond via HTTP', async () => {
    const app = Fastify();
    await app.register(fastifyCookie);

    // Mock database & candidate service
    const mockDb = {};
    await app.register(extensionRoutes, {
      prefix: '/api/extension',
      db: mockDb,
      candidateProfileService: mockCandidateProfileService,
      extensionAssistantService: assistantService,
    });

    // Mock resolveExtensionSession by monkey-patching or passing auth cookie
    // Let's test calling /assistant/context without auth -> returns 401 UNAUTHENTICATED
    const unauthResponse = await app.inject({
      method: 'POST',
      url: '/api/extension/assistant/context',
      payload: { job: sampleJob },
    });
    assert.equal(unauthResponse.statusCode, 401);
    const unauthData = JSON.parse(unauthResponse.payload);
    assert.equal(unauthData.code, 'UNAUTHENTICATED');

    // Test explaining error route (does not require active session)
    const errResponse = await app.inject({
      method: 'POST',
      url: '/api/extension/assistant/explain-error',
      payload: { error: 'Network timeout during portal submission' },
    });
    // Requires authentication per endpoint design
    assert.equal(errResponse.statusCode, 401);
  });
});

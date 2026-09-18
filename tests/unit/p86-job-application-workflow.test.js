/**
 * @file Unit Tests: Simplified Job Application Workflow (P86 Phase 2 Continuation)
 *
 * Verifies all requirements specified in user protocol:
 * 1. complete profile -> no unnecessary questions (all ready items in readyToApply, 0 in needsAttention)
 * 2. missing field -> one actionable request ("We need your {field}" with [Add] / [Answer])
 * 3. conflicting values -> explicit conflict ("Your profile says X, but this application says Y")
 * 4. conflict resolution -> KEEP_PROFILE vs USE_APPLICATION, never silently resolved
 * 5. NOT_SET -> not treated as NO (produces MISSING request, not an affirmative NO)
 * 6. profile value reused -> valid profile data is inherited and never asked again
 * 7. application-specific value isolated -> application answers stay on application, not mutating candidate profile
 * 8. submission blocked when required data is missing -> throws ValidationError
 * 9. successful ready flow -> complete and confirmed application submits successfully
 * 10. AI safety boundary -> AI never auto-answers sensitive eligibility questions
 * 11. renderApplyPage UI integration -> renders calm, human-friendly review without internal AST/resolver leaks
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JobApplicationFlowService } from '../../src/services/job-application-flow.service.js';
import { ApplicationReadinessService } from '../../src/services/application-readiness.service.js';
import { renderApplyPage } from '../../src/views/apply.page.js';
import { ValidationError } from '../../src/errors/index.js';

describe('P86: Simplified Job Application Workflow Suite', () => {
  const readinessService = new ApplicationReadinessService();

  // Mock Database for JobApplicationFlowService
  function createMockDb({ applications = [], candidates = [] } = {}) {
    const appMap = new Map(applications.map((a) => [a.id, { ...a }]));
    const candMap = new Map(candidates.map((c) => [c.id, { ...c }]));

    return {
      _apps: appMap,
      _cands: candMap,
      select: () => ({
        from: (table) => ({
          where: (_cond) => {
            const tableName = table[Symbol.for('drizzle:Name')] || table._?.name || 'job_applications';
            if (tableName === 'job_applications' || tableName === 'jobApplications') {
              return Array.from(appMap.values());
            }
            return Array.from(candMap.values());
          },
        }),
      }),
      update: (_table) => ({
        set: (values) => ({
          where: (_cond) => {
            // Update the first application in appMap
            for (const [id, app] of appMap.entries()) {
              appMap.set(id, { ...app, ...values });
              break;
            }
            return Promise.resolve();
          },
        }),
      }),
    };
  }

  const completeCandidateProfile = {
    displayName: 'Vishwanath Nishad',
    canonicalEmail: 'vishwanatnishad@gmail.com',
    profileMetadata: {
      userCustom: {
        phone: '+91-9876543210',
        location: 'Bengaluru, India',
        education: [{ institution: 'Rajasthan Technical University', degree: 'B.Tech CS' }],
        experience: [{ company: 'Enterprise Scale', title: 'Staff Architect' }],
        portfolioLinks: [
          { platform: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad' },
          { platform: 'GitHub', url: 'https://github.com/vishu1803' },
          { platform: 'Portfolio', url: 'https://vishwanath.dev' },
        ],
      },
      careerPreferences: {
        workAuthorization: ['Authorized to work in India'],
        workAuthConfirmedByUser: true,
        visaSponsorshipRequired: false,
        visaSponsorshipConfirmedByUser: true,
        noticePeriod: '30_days',
        noticePeriodConfirmed: true,
        availabilityDate: '2026-10-15',
        salaryFloor: 120000,
        salaryCurrency: 'USD',
      },
    },
    resumes: [{ filename: 'Vishwanath-Nishad-Resume.pdf' }],
    skills: ['Node.js', 'PostgreSQL', 'Fastify', 'TypeScript'],
  };

  const sampleApplication = {
    id: 'app-test-uuid-001',
    tenantId: 'tenant-test-001',
    candidateId: 'cand-test-001',
    companyName: 'Anthropic',
    jobTitle: 'Senior Systems Architect',
    location: 'Remote, US',
    status: 'SAVED',
    metadata: {
      answers: {},
      declarations: {},
      handoffKit: {
        resume: { filename: 'Vishwanath-Nishad-Resume.pdf', storageKey: 'key-resume-001' },
      },
    },
  };

  it('1. complete profile -> no unnecessary questions (all ready in readyToApply, 0 in needsAttention)', () => {
    const mockDb = createMockDb({ applications: [sampleApplication] });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    const flowState = service.buildApplicationFlowState({
      candidateProfile: completeCandidateProfile,
      application: sampleApplication,
    });

    assert.ok(flowState.readyToApply.length >= 6);
    assert.equal(flowState.needsAttention.length, 0, 'Complete profile should have 0 items needing attention');
    assert.equal(flowState.semantics.canSubmit, true);

    const readyKeys = flowState.readyToApply.map((i) => i.key);
    assert.ok(readyKeys.includes('resume'));
    assert.ok(readyKeys.includes('email'));
    assert.ok(readyKeys.includes('phone'));
    assert.ok(readyKeys.includes('education'));
    assert.ok(readyKeys.includes('experience'));
    assert.ok(readyKeys.includes('skills'));
    assert.ok(readyKeys.includes('workAuthorization'));
    assert.ok(readyKeys.includes('noticePeriod'));
  });

  it('2. missing field -> exactly one actionable request ("We need your {field}" with [Add] / [Answer])', () => {
    const profileMissingNotice = {
      ...completeCandidateProfile,
      profileMetadata: {
        ...completeCandidateProfile.profileMetadata,
        careerPreferences: {
          ...completeCandidateProfile.profileMetadata.careerPreferences,
          noticePeriod: null,
          availabilityDate: null,
        },
      },
    };

    const mockDb = createMockDb({ applications: [sampleApplication] });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    const flowState = service.buildApplicationFlowState({
      candidateProfile: profileMissingNotice,
      application: sampleApplication,
    });

    const noticeItem = flowState.needsAttention.find((i) => i.field === 'noticePeriod');
    assert.ok(noticeItem, 'Notice period should be in needsAttention');
    assert.equal(noticeItem.type, 'MISSING');
    assert.equal(noticeItem.prompt, 'We need your notice period.');
    assert.equal(noticeItem.actionLabel, 'Add');
    assert.equal(flowState.semantics.canSubmit, false);
  });

  it('3. conflicting values -> explicit conflict ("Your profile says X, but this application says Y")', () => {
    const applicationWithConflictingNotice = {
      ...sampleApplication,
      metadata: {
        answers: {
          noticePeriod: 'immediate',
        },
      },
    };

    const mockDb = createMockDb({ applications: [applicationWithConflictingNotice] });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    const flowState = service.buildApplicationFlowState({
      candidateProfile: completeCandidateProfile, // profile has '30_days'
      application: applicationWithConflictingNotice, // application has 'immediate'
    });

    const conflictItem = flowState.needsAttention.find((i) => i.field === 'noticePeriod');
    assert.ok(conflictItem, 'Notice period conflict must be detected');
    assert.equal(conflictItem.type, 'CONFLICT');
    assert.ok(conflictItem.prompt.includes('Your profile says 30 days, but this application says immediate availability.'));
    assert.equal(conflictItem.choices.length, 3);
    assert.equal(conflictItem.choices[0].action, 'KEEP_PROFILE');
    assert.ok(conflictItem.choices[0].label.includes('Keep 30 days'));
    assert.equal(conflictItem.choices[1].action, 'USE_APPLICATION');
    assert.ok(conflictItem.choices[1].label.includes('Use immediate'));
    assert.equal(conflictItem.choices[2].action, 'EDIT_PROFILE');
  });

  it('4. conflict resolution -> KEEP_PROFILE updates application to profile value; USE_APPLICATION confirms application value', async () => {
    const applicationWithConflict = {
      ...sampleApplication,
      metadata: {
        answers: {
          noticePeriod: 'immediate',
        },
      },
    };

    const mockDb = createMockDb({ applications: [applicationWithConflict] });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    // 1. Resolve choosing KEEP_PROFILE
    const keepAnswers = await service.resolveFieldConflict({
      application: applicationWithConflict,
      field: 'noticePeriod',
      choice: 'KEEP_PROFILE',
      candidateProfile: completeCandidateProfile,
    });

    assert.equal(keepAnswers.noticePeriod, '30_days', 'KEEP_PROFILE should adopt profile value');
    assert.equal(keepAnswers.noticePeriodConfirmed, true);

    // 2. Resolve choosing USE_APPLICATION
    const useAnswers = await service.resolveFieldConflict({
      application: applicationWithConflict,
      field: 'noticePeriod',
      choice: 'USE_APPLICATION',
      candidateProfile: completeCandidateProfile,
    });

    assert.equal(useAnswers.noticePeriodConfirmed, true);
  });

  it('5. NOT_SET -> not treated as NO (produces MISSING request, not an affirmative NO)', () => {
    const profileWithNotSetVisa = {
      ...completeCandidateProfile,
      profileMetadata: {
        ...completeCandidateProfile.profileMetadata,
        careerPreferences: {
          ...completeCandidateProfile.profileMetadata.careerPreferences,
          visaSponsorshipRequired: 'NOT_SET',
          visaSponsorshipConfirmedByUser: false,
        },
      },
    };

    const mockDb = createMockDb({ applications: [sampleApplication] });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    const flowState = service.buildApplicationFlowState({
      candidateProfile: profileWithNotSetVisa,
      application: sampleApplication,
    });

    const visaItem = flowState.needsAttention.find((i) => i.field === 'visaSponsorship');
    assert.ok(visaItem, 'visaSponsorship should be in needsAttention');
    assert.equal(visaItem.type, 'MISSING', 'NOT_SET must produce MISSING, not affirmative NO');
    assert.equal(visaItem.prompt, 'We need your visa sponsorship requirements.');
  });

  it('6. profile value reused -> valid profile fields are inherited and not asked again', () => {
    const mockDb = createMockDb({ applications: [sampleApplication] });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    const flowState = service.buildApplicationFlowState({
      candidateProfile: completeCandidateProfile,
      application: sampleApplication,
    });

    const email = flowState.readyToApply.find((i) => i.key === 'email');
    assert.equal(email.value, 'vishwanatnishad@gmail.com');

    const phone = flowState.readyToApply.find((i) => i.key === 'phone');
    assert.equal(phone.value, '+91-9876543210');

    const notice = flowState.readyToApply.find((i) => i.key === 'noticePeriod');
    assert.ok(notice.value.toLowerCase().includes('30 days'));

    // Verify none of these are in needsAttention
    const attentionFields = flowState.needsAttention.map((i) => i.field);
    assert.ok(!attentionFields.includes('email'));
    assert.ok(!attentionFields.includes('phone'));
    assert.ok(!attentionFields.includes('noticePeriod'));
    assert.ok(!attentionFields.includes('workAuthorization'));
  });

  it('7. application-specific value isolated -> application answers stay on application, not mutating candidate profile', async () => {
    let profileUpdated = false;
    const mockCandidateProfileService = {
      updateCareerPreferences: () => {
        profileUpdated = true;
        return Promise.resolve();
      },
    };

    const mockDb = createMockDb({ applications: [sampleApplication] });
    const service = new JobApplicationFlowService({
      database: mockDb,
      readinessService,
      candidateProfileService: mockCandidateProfileService,
    });

    // Answering an application-specific field with saveToProfile: false
    const answers = await service.answerMissingField({
      application: sampleApplication,
      field: 'employerEligibilityQuestion',
      value: 'Legally eligible and verified',
      saveToProfile: false,
    });

    assert.equal(answers.employerEligibilityQuestion, 'Legally eligible and verified');
    assert.equal(profileUpdated, false, 'Permanent candidate profile must not be mutated by application-specific answer');
  });

  it('8. submission blocked when required data is missing -> throws ValidationError', async () => {
    const incompleteApp = {
      ...sampleApplication,
      metadata: { answers: {} },
    };

    const candidateMissingInfo = {
      id: 'cand-test-001',
      tenantId: 'tenant-test-001',
      displayName: 'Incomplete Candidate',
      profileMetadata: { userCustom: {}, careerPreferences: {} },
    };

    const mockDb = createMockDb({
      applications: [incompleteApp],
      candidates: [candidateMissingInfo],
    });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    await assert.rejects(
      async () => {
        await service.submitApplication({
          tenantId: 'tenant-test-001',
          candidateId: 'cand-test-001',
          applicationId: incompleteApp.id,
          declarations: { accuracyConfirmed: true },
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('Cannot submit application with unresolved readiness issues'));
        return true;
      }
    );
  });

  it('9. successful ready flow -> complete and confirmed application submits successfully', async () => {
    const candidateComplete = {
      id: 'cand-test-001',
      tenantId: 'tenant-test-001',
      ...completeCandidateProfile,
    };

    const mockDb = createMockDb({
      applications: [sampleApplication],
      candidates: [candidateComplete],
    });
    const service = new JobApplicationFlowService({ database: mockDb, readinessService });

    const result = await service.submitApplication({
      tenantId: 'tenant-test-001',
      candidateId: 'cand-test-001',
      applicationId: sampleApplication.id,
      declarations: { accuracyConfirmed: true },
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'APPLIED');
    assert.ok(result.appliedAt);
    assert.equal(result.handoffUrl, `/applications/${sampleApplication.id}/handoff`);
  });

  it('10. AI safety boundary -> AI never auto-answers sensitive eligibility questions', () => {
    const service = new JobApplicationFlowService({ readinessService });

    // Sensitive questions
    const visaAssistance = service.getAiAssistanceForQuestion({
      question: 'Will you now or in the future require visa sponsorship for employment?',
    });
    assert.equal(visaAssistance.isSensitive, true);
    assert.equal(visaAssistance.autoAnswerBlocked, true);
    assert.equal(visaAssistance.suggestedAnswer, null);
    assert.equal(visaAssistance.requiresUserConfirmation, true);
    assert.ok(visaAssistance.guidance.includes('AI cannot automatically answer'));

    const workAuthAssistance = service.getAiAssistanceForQuestion({
      question: 'What is your current legal work authorization status in the United States?',
    });
    assert.equal(workAuthAssistance.isSensitive, true);
    assert.equal(workAuthAssistance.autoAnswerBlocked, true);

    // Non-sensitive question
    const techAssistance = service.getAiAssistanceForQuestion({
      question: 'What is your experience deploying microservices on Kubernetes?',
    });
    assert.equal(techAssistance.isSensitive, false);
    assert.equal(techAssistance.autoAnswerBlocked, false);
    assert.ok(techAssistance.suggestedAnswer !== null);
  });

  it('11. renderApplyPage UI integration -> renders calm, human-friendly review without internal AST/resolver leaks', () => {
    const service = new JobApplicationFlowService({ readinessService });

    const flowState = service.buildApplicationFlowState({
      candidateProfile: completeCandidateProfile,
      application: sampleApplication,
    });

    const reviewSnapshot = service.buildReviewSnapshot({
      candidate: completeCandidateProfile,
      candidateProfile: completeCandidateProfile,
      application: sampleApplication,
    });

    const html = renderApplyPage({
      user: { id: 'user-001', displayName: 'Vishwanath Nishad', email: 'vishwanatnishad@gmail.com' },
      application: sampleApplication,
      flowState,
      reviewSnapshot,
      activeStep: 'readiness',
    });

    // Check headings and UI sections
    assert.ok(html.includes('Ready to apply'));
    assert.ok(html.includes('Needs your attention'));
    assert.ok(html.includes('Tailored Resume'));
    assert.ok(html.includes('Senior Systems Architect'));
    assert.ok(html.includes('Anthropic'));

    // Assert absence of internal AST resolver leakages
    assert.ok(!html.includes('APPLICATION_ANSWERS > PROFILE_CAREER_PREFERENCES'));
    assert.ok(!html.includes('AST parser'));
    assert.ok(!html.includes('regex:'));
    assert.ok(!html.includes('scoreVersion: "p82.0"'));
  });
});

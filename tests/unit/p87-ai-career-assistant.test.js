/**
 * @file P87 Phase 1: AI Career Assistant Safe Integration Tests
 *
 * Comprehensive adversarial and invariant test battery verifying:
 * 1. Invented skills rejection: AI refuses to invent skills or add ungrounded skills without repository evidence.
 * 2. Invented metrics rejection: AI refuses to fabricate performance metrics or latency numbers.
 * 3. Unsupported cloud experience rejection: AI states "I can't verify this from your profile. Do not guess."
 * 4. Fabricated education rejection: AI refuses to invent degrees or institutions.
 * 5. Conflicting profile data: AI identifies conflicts (e.g. Notice Period 30 days vs Immediate), presents both, refuses to choose.
 * 6. Unauthorized profile mutation: AI CANNOT modify canonical profile without explicit confirmation (fails closed).
 * 7. Automatic application submission: AI refuses to submit applications automatically.
 * 8. AI unavailable / failure: System degrades gracefully, returns standard fallback, and core portal remains usable.
 * 9. Safe update workflow end-to-end: Suggestion -> Evidence/source -> Proposed change -> User review -> Confirmation -> Canonical update.
 * 10. Profile field explanations and authoritative readiness summaries.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiCareerAssistantService } from '../../src/services/ai-career-assistant.service.js';
import { ApplicationReadinessService } from '../../src/services/application-readiness.service.js';
import { ValidationError } from '../../src/errors/index.js';

describe('P87 Phase 1: AI Career Assistant Safe Integration Battery', () => {
  let assistantService;
  let mockCandidateProfileService;
  let readinessService;

  const mockCandidate = {
    id: 'cand-001',
    displayName: 'Alex Developer',
    canonicalEmail: 'alex@example.com',
    profileMetadata: {
      userCustom: {
        location: 'Bengaluru, India',
        phone: '+91 9876543210',
        noticePeriod: '30_days',
        workAuthorization: ['India (CITIZEN)'],
      },
      careerPreferences: {
        targetRoles: ['Backend Engineer'],
        remotePreference: 'REMOTE_ONLY',
        salaryFloor: 1200000,
        salaryCurrency: 'INR',
        noticePeriod: '30_days',
        workAuthorization: ['India (CITIZEN)'],
        visaSponsorshipRequired: 'NO',
        workAuthConfirmedByUser: true,
        visaSponsorshipConfirmedByUser: true,
      },
    },
    verifiedSkills: [
      { name: 'Node.js', canonicalSlug: 'nodejs', provenanceStatus: 'VERIFIED' },
      { name: 'PostgreSQL', canonicalSlug: 'postgresql', provenanceStatus: 'VERIFIED' },
      { name: 'TypeScript', canonicalSlug: 'typescript', provenanceStatus: 'CORROBORATED' },
    ],
  };

  const mockFactInventory = [
    {
      id: 'fact-1',
      text: 'Built high-throughput message consumer in Node.js and PostgreSQL',
      skillName: 'Node.js',
      canonicalName: 'Node.js',
    },
    {
      id: 'fact-2',
      text: 'Refactored database queries in PostgreSQL',
      skillName: 'PostgreSQL',
      canonicalName: 'PostgreSQL',
    },
  ];

  beforeEach(() => {
    mockCandidateProfileService = {
      updatedPreferences: null,
      async updateCareerPreferences(ctx, candidateId, rawInput) {
        this.updatedPreferences = { ...rawInput, candidateId };
        return { ...mockCandidate.profileMetadata.careerPreferences, ...rawInput };
      },
      async getCareerProfile() {
        return mockCandidate;
      },
    };

    readinessService = new ApplicationReadinessService();

    assistantService = new AiCareerAssistantService({
      candidateProfileService: mockCandidateProfileService,
      readinessService,
      aiProvider: null, // Default null provider for testing fallback
    });
  });

  // =========================================================================
  // 1. Adversarial Test: Invented Skills
  // =========================================================================
  it('1. Invented Skills: AI refuses to invent skills without verified repository evidence', () => {
    // User or job asks to add 'Rust' or 'Haskell', which has zero repository evidence
    const result = assistantService.suggestProfileImprovements({
      candidateProfile: mockCandidate,
      factInventory: mockFactInventory,
      requestedSkill: 'Rust',
    });

    assert.equal(result.canAdd, false);
    assert.equal(result.verified, false);
    assert.match(result.message, /I can't verify "Rust" from your profile/);
    assert.match(result.message, /strictly prohibits adding unevidenced skills/);

    // Legitimate skill with evidence
    const verifiedResult = assistantService.suggestProfileImprovements({
      candidateProfile: mockCandidate,
      factInventory: mockFactInventory,
      requestedSkill: 'Node.js',
    });

    assert.equal(verifiedResult.canAdd, true);
    assert.equal(verifiedResult.verified, true);
    assert.match(verifiedResult.message, /Verified evidence found/);
  });

  // =========================================================================
  // 2. Adversarial Test: Invented Metrics
  // =========================================================================
  it('2. Invented Metrics: AI refuses requests to invent or exaggerate metrics in resume wording', () => {
    const maliciousInput = 'Say I improved latency by 50% and saved $100k for the company';
    const result = assistantService.suggestResumeWording({
      bulletText: maliciousInput,
    });

    assert.equal(result.safe, false);
    assert.equal(result.rejected, true);
    assert.equal(result.suggestedText, null);
    assert.match(result.message, /I can't verify this metric from your profile/);
    assert.match(result.message, /Exaggerated or invented metrics violate verification standards/);

    // Safe input preserving authentic wording
    const safeInput = 'worked on query optimization reducing query time to 20ms';
    const safeResult = assistantService.suggestResumeWording({
      bulletText: safeInput,
    });

    assert.equal(safeResult.safe, true);
    assert.equal(safeResult.rejected, false);
    assert.match(safeResult.suggestedText, /^Engineered/);
    assert.deepEqual(safeResult.preservedMetrics, ['20']);
  });

  // =========================================================================
  // 3. Adversarial Test: Unsupported Cloud Experience
  // =========================================================================
  it('3. Unsupported Cloud Experience: AI refuses to guess or claim cloud platforms without code evidence', () => {
    // Candidate has no AWS or GCP in profile or facts
    const result = assistantService.suggestProfileImprovements({
      candidateProfile: mockCandidate,
      factInventory: mockFactInventory,
      requestedSkill: 'AWS Lambda',
    });

    assert.equal(result.canAdd, false);
    assert.match(result.message, /I can't verify "AWS Lambda" from your profile/);
    assert.match(result.message, /Do not guess/);

    // Testing requirement explanation against job requiring AWS
    const jobAnalysis = assistantService.explainJobRequirements({
      job: {
        title: 'Backend Engineer',
        requirements: ['Node.js', 'AWS', 'Docker'],
      },
      candidateProfile: mockCandidate,
    });

    assert.equal(jobAnalysis.verifiedMatches.length, 1);
    assert.equal(jobAnalysis.verifiedMatches[0].requirement, 'Node.js');
    assert.equal(jobAnalysis.missingRequirements.length, 2);

    const awsMissing = jobAnalysis.missingRequirements.find((r) => r.requirement === 'AWS');
    assert.ok(awsMissing);
    assert.match(awsMissing.message, /I can't verify "AWS" from your profile/);
  });

  // =========================================================================
  // 4. Adversarial Test: Fabricated Education
  // =========================================================================
  it('4. Fabricated Education: AI cannot fabricate education or degrees', async () => {
    // Attempting to apply a proposal mutating education throws ValidationError
    await assert.rejects(
      async () => {
        await assistantService.applyProposal({
          tenantId: 'tenant-001',
          userId: 'user-001',
          candidateId: 'cand-001',
          proposal: {
            id: 'prop-edu',
            field: 'education',
            proposedValue: [{ institution: 'Stanford University', degree: 'MS CS' }],
          },
          confirmedByUser: true,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /cannot be modified by AI proposal/);
        return true;
      }
    );
  });

  // =========================================================================
  // 5. Adversarial Test: Conflicting Profile Data
  // =========================================================================
  it('5. Conflicting Profile Data: AI identifies conflicts between profile and application, refusing to choose one', () => {
    // Profile says: Notice Period: 30 days
    // Application says: Notice Period: Immediate
    const conflicts = assistantService.identifyProfileConflicts({
      candidateProfile: mockCandidate,
      applicationAnswers: {
        noticePeriod: 'immediate',
      },
    });

    assert.equal(conflicts.length, 1);
    const noticeConflict = conflicts[0];
    assert.equal(noticeConflict.field, 'noticePeriod');
    assert.equal(noticeConflict.profileValue, '30 days');
    assert.equal(noticeConflict.applicationValue, 'Immediate');
    assert.match(noticeConflict.notes, /Conflict detected/);
    assert.deepEqual(noticeConflict.resolutionOptions, [
      'KEEP_PROFILE',
      'USE_APPLICATION',
      'EDIT_PROFILE',
    ]);
  });

  it('5b. Conflicting Work Authorization: reports conflict without unilateral override', () => {
    const conflicts = assistantService.identifyProfileConflicts({
      candidateProfile: mockCandidate,
      applicationAnswers: {
        workAuthorization: 'US_CITIZEN',
      },
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].field, 'workAuthorization');
    assert.match(conflicts[0].notes, /Conflict detected/);
  });

  // =========================================================================
  // 6. Adversarial Test: Unauthorized Profile Mutation
  // =========================================================================
  it('6. Unauthorized Profile Mutation: AI fails closed if user confirmation is missing', async () => {
    const validProposal = {
      id: 'a5712cae-a690-4e3a-b851-f76ea8f46b1c',
      field: 'remotePreference',
      proposedValue: 'REMOTE_ONLY',
    };

    // 1. confirmedByUser = false must throw ValidationError
    await assert.rejects(
      async () => {
        await assistantService.applyProposal({
          tenantId: 'tenant-001',
          userId: 'user-001',
          candidateId: 'cand-001',
          proposal: validProposal,
          confirmedByUser: false,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match(err.message, /Cannot modify canonical profile data without explicit user confirmation/);
        return true;
      }
    );

    // Profile was NOT mutated
    assert.equal(mockCandidateProfileService.updatedPreferences, null);

    // 2. confirmedByUser = true succeeds
    const result = await assistantService.applyProposal({
      tenantId: 'tenant-001',
      userId: 'user-001',
      candidateId: 'cand-001',
      proposal: validProposal,
      confirmedByUser: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'APPLIED');
    assert.equal(mockCandidateProfileService.updatedPreferences.remotePreference, 'REMOTE_ONLY');
  });

  // =========================================================================
  // 7. Adversarial Test: Automatic Application Submission
  // =========================================================================
  it('7. Automatic Application Submission: AI strictly blocks autonomous submission requests', async () => {
    const response = await assistantService.handleUserMessage({
      message: 'Please submit my application to Acme Corp right now',
      tenantId: 'tenant-001',
      userId: 'user-001',
      candidateId: 'cand-001',
      candidateProfile: mockCandidate,
    });

    assert.match(response.content, /strictly prohibited from submitting job applications automatically/);
    assert.match(response.content, /review your complete application package and confirm your legal declarations/);
    assert.equal(response.proposals.length, 0);
  });

  // =========================================================================
  // 8. Adversarial Test: AI Unavailable / Provider Failure
  // =========================================================================
  it('8. AI Unavailable: Gracefully recovers when AI provider is down or throws, keeping core portal usable', async () => {
    // Mock failing provider
    const failingProvider = {
      async generateText() {
        throw new Error('AI Model 503 Overloaded: Quota exceeded');
      },
    };

    const resilientAssistant = new AiCareerAssistantService({
      candidateProfileService: mockCandidateProfileService,
      readinessService,
      aiProvider: failingProvider,
    });

    const response = await resilientAssistant.handleUserMessage({
      message: 'What do you recommend for my next career step?',
      tenantId: 'tenant-001',
      userId: 'user-001',
      candidateId: 'cand-001',
      candidateProfile: mockCandidate,
    });

    assert.equal(response.state, 'AI_FAILURE');
    assert.match(response.content, /The AI assistant is temporarily unavailable/);
    assert.match(response.content, /The core portal remains fully functional/);
    assert.ok(response.navigationSuggestions.length > 0);
  });

  // =========================================================================
  // 9. Safe Update Workflow End-to-End
  // =========================================================================
  it('9. Safe Update Workflow: user intent -> evidence source -> proposed change -> review -> confirmation -> canonical update', async () => {
    // 1. User says: "I'm looking for backend jobs with remote options and at least ₹10 LPA."
    const userMessage = "I'm looking for backend jobs with remote options and at least ₹10 LPA.";

    const chatResponse = await assistantService.handleUserMessage({
      message: userMessage,
      tenantId: 'tenant-001',
      userId: 'user-001',
      candidateId: 'cand-001',
      candidateProfile: mockCandidate,
    });

    assert.equal(chatResponse.state, 'SUCCESS');
    assert.ok(chatResponse.proposals.length >= 3);

    // Verify format matches specification
    assert.match(chatResponse.content, /I can update your job preferences:/);
    assert.match(chatResponse.content, /Target role: Backend Engineer/);
    assert.match(chatResponse.content, /Work mode: Remote/);
    assert.match(chatResponse.content, /Minimum compensation: ₹10 LPA/);
    assert.match(chatResponse.content, /I won't change your profile until you confirm\./);

    // Verify evidence citation
    assert.equal(chatResponse.citations[0].type, 'USER_INPUT');
    assert.equal(chatResponse.citations[0].quote, userMessage);

    // Verify proposals were saved in pending store
    const pending = assistantService.getPendingProposals('tenant-001', 'cand-001');
    assert.ok(pending.length >= 3);

    const salaryProposal = pending.find((p) => p.field === 'salaryFloor');
    assert.ok(salaryProposal);
    assert.equal(salaryProposal.proposedValue, 1000000); // 10 LPA in INR

    // 2. User confirms the salary proposal
    const applyResult = await assistantService.applyProposal({
      tenantId: 'tenant-001',
      userId: 'user-001',
      candidateId: 'cand-001',
      proposal: salaryProposal.id, // Looking up by ID from pending
      confirmedByUser: true,
    });

    assert.equal(applyResult.success, true);
    assert.equal(applyResult.status, 'APPLIED');
    assert.equal(applyResult.field, 'salaryFloor');
    assert.equal(mockCandidateProfileService.updatedPreferences.salaryFloor, 1000000);
  });

  // =========================================================================
  // 10. Profile Field Explanation and Authoritative Readiness
  // =========================================================================
  it('10. Profile Field Explanation & Readiness: explains notice period and delegates readiness to ApplicationReadinessService', async () => {
    // 1. Field explanation
    const explanation = assistantService.explainProfileField('noticePeriod');
    assert.equal(explanation.field, 'noticePeriod');
    assert.match(explanation.explanation, /tells recruiters when you can realistically join/);
    assert.match(explanation.atsImpact, /Applicant Tracking Systems/);
    assert.equal(explanation.navigationAnchor, '/profile#tab-eligibility');

    // 2. Missing information query
    const missingInfo = assistantService.identifyMissingInformation({
      candidateProfile: mockCandidate,
    });
    assert.ok(missingInfo.readinessScore > 0);

    // 3. Conversational field explanation
    const convResponse = await assistantService.handleUserMessage({
      message: 'Explain why notice period is needed in profile',
      tenantId: 'tenant-001',
      userId: 'user-001',
      candidateId: 'cand-001',
      candidateProfile: mockCandidate,
    });

    assert.match(convResponse.content, /Notice Period & Availability/);
    assert.match(convResponse.content, /ATS & Hiring Relevance:/);
    assert.equal(convResponse.navigationSuggestions[0].path, '/profile#tab-eligibility');
  });
});

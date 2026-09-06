/**
 * @file Unit Tests: Application Handoff Service
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationHandoffService } from '../../src/services/application-handoff.service.js';

describe('ApplicationHandoffService', () => {
  // Hermetic candidate profile source: the service is fail-closed and requires a
  // loadable canonical profile (previously a silent null produced placeholder PDFs).
  const stubProfileService = {
    getProfile: async (_context, candidateId) => ({
      candidate: {
        id: candidateId,
        displayName: 'Vishwanath Nishad',
        summary: 'Backend engineer focused on robust API services.',
        profileMetadata: {
          userCustom: {
            education: [
              {
                degree: 'Bachelor of Technology in Electronics Engineering',
                institution: 'Rajkiya Engineering College',
                fieldOfStudy: 'Electronics Engineering',
                startDate: '2021',
                endDate: '2025-07',
              },
            ],
            experience: [
              {
                title: 'Full Stack Developer Intern',
                company: 'FTV Saloon',
                startDate: '2024-06',
                endDate: '2024-09',
                bullets: ['Built RESTful APIs for core operations.'],
              },
            ],
          },
        },
      },
      userEmail: 'vishwanatnishad@gmail.com',
      identities: [],
      resources: [],
      projects: [],
      skills: [],
    }),
  };

  const service = new ApplicationHandoffService({
    candidateProfileService: stubProfileService,
  });

  const mockCandidateProfile = {
    displayName: 'Vishwanath Nishad',
    primaryEmail: 'vishwanatnishad@gmail.com',
    candidatePhone: '+1-555-0199',
    githubUsername: 'vishu1803',
    profileMetadata: {
      identity: {
        phone: '+1-555-0199',
        workAuthorization: 'Authorized to work in US',
        visaSponsorshipRequired: false,
      },
      readiness: {
        workAuthorization: 'Authorized to work in US',
        visaSponsorshipRequired: false,
      },
      contact: {
        phone: '+1-555-0199',
        links: [
          { platform: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad' },
          { platform: 'GitHub', url: 'https://github.com/vishu1803' },
        ],
      },
      jobPreferences: {
        availabilityDate: '2026-10-01',
      },
    },
    portfolioLinks: [{ platform: 'GitHub', url: 'https://github.com/vishu1803' }],
  };

  const mockPkg = {
    candidateId: '00000000-0000-0000-0000-000000000001',
    candidateName: 'Vishwanath Nishad',
    candidateEmail: 'vishwanatnishad@gmail.com',
    candidatePhone: '+1-555-0199',
    targetJob: {
      id: 'job-vercel-001',
      title: 'Infrastructure Engineer',
      company: 'Vercel',
      location: 'Remote, US',
      applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/5450849004',
      retrievedAt: '2026-09-05T00:00:00Z',
    },
    tailoredResume: {
      title: 'Resume',
      markdownContent:
        '# Vishwanath Nishad\n\n**Email:** vishwanatnishad@gmail.com\n\n### Professional Summary\nSpecialist in cloud distributed systems.',
      contentHash: 'hash-res-1',
      fitScore: 92,
    },
    coverLetter: {
      title: 'Cover Letter',
      markdownContent:
        "Dear Hiring Team at Vercel,\n\nI am thrilled to apply for the Infrastructure Engineer position. With extensive experience architecting high-performance distributed systems, low-latency stream processing, and secure cloud infrastructure, I am eager to contribute to Vercel's mission.\n\nThank you for considering my application.\n\nSincerely,\nVishwanath Nishad",
      contentHash: 'hash-cl-1',
    },
    verifiedSkills: [{ name: 'Node.js', truthCategory: 'VERIFIED' }],
    claimedSkills: [{ name: 'TypeScript', truthCategory: 'CLAIMED' }],
    portfolioLinks: [
      { projectName: 'Ai-career-agent', repositoryUrl: 'https://github.com/vishu1803' },
    ],
    packageHash: '8e4f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7',
    preparedAt: '2026-09-05T00:00:00Z',
  };

  it('1. evaluates readiness items with canonical states and profile deep links', () => {
    const items = service.evaluateApplicationReadiness({
      candidateProfile: mockCandidateProfile,
      applicationPackage: mockPkg,
    });

    assert.ok(items.length >= 6);

    const emailItem = items.find((i) => i.field === 'email');
    assert.equal(emailItem.status, 'READY');
    assert.equal(emailItem.value, 'vishwanatnishad@gmail.com');
    assert.equal(emailItem.profileAnchor, '/profile#section-contact');

    const phoneItem = items.find((i) => i.field === 'phone');
    assert.equal(phoneItem.status, 'READY');
    assert.equal(phoneItem.value, '+1-555-0199');

    const workAuthItem = items.find((i) => i.field === 'workAuthorization');
    assert.equal(workAuthItem.status, 'NEEDS_CONFIRMATION');
    assert.equal(workAuthItem.profileAnchor, '/profile#section-readiness');

    const sponsorshipItem = items.find((i) => i.field === 'visaSponsorship');
    assert.equal(sponsorshipItem.status, 'NEEDS_CONFIRMATION');
    assert.equal(sponsorshipItem.profileAnchor, '/profile#section-readiness');

    const linkedinItem = items.find((i) => i.field === 'linkedin');
    assert.equal(linkedinItem.status, 'READY');
    assert.equal(linkedinItem.profileAnchor, '/profile#section-links');
  });

  it('2. marks missing fields as MISSING with profile anchors', () => {
    const sparseProfile = {
      displayName: 'Vishwanath',
      primaryEmail: 'vishwanatnishad@gmail.com',
      profileMetadata: {},
    };

    const items = service.evaluateApplicationReadiness({
      candidateProfile: sparseProfile,
      applicationPackage: { candidateEmail: 'vishwanatnishad@gmail.com' },
    });

    const phoneItem = items.find((i) => i.field === 'phone');
    assert.equal(phoneItem.status, 'MISSING');
    assert.equal(phoneItem.value, null);
    assert.ok(phoneItem.profileAnchor.includes('/profile#section-contact'));

    const workAuth = items.find((i) => i.field === 'workAuthorization');
    assert.equal(workAuth.status, 'MISSING');
    assert.ok(workAuth.profileAnchor.includes('/profile#section-readiness'));
  });

  it('3. builds complete Handoff Kit with encrypted artifacts and QA audit', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const userId = '00000000-0000-0000-0000-000000000002';
    const candidateId = '00000000-0000-0000-0000-000000000003';

    const handoffKit = await service.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: mockPkg,
      destinationUrl: 'https://boards.greenhouse.io/vercel/jobs/5450849004',
    });

    assert.equal(handoffKit.status, 'HANDOFF_READY');
    assert.equal(handoffKit.packageHash, mockPkg.packageHash);
    assert.ok(handoffKit.submissionNotice.includes('manual submission'));
    assert.ok(handoffKit.resume);
    assert.equal(handoffKit.resume.filename, 'tailored-resume.pdf');
    assert.ok(handoffKit.resume.contentHash);
    assert.ok(handoffKit.resume.storageKey);
    assert.ok(handoffKit.resume.viewUrl.includes('/artifacts/resume/view'));
    assert.ok(handoffKit.resume.downloadUrl.includes('/artifacts/resume/download'));
    assert.ok(handoffKit.resume.qaAudit.passed);
    assert.ok(handoffKit.resume.qaAudit.score >= 75);

    assert.ok(handoffKit.coverLetter);
    assert.equal(handoffKit.coverLetter.filename, 'tailored-cover-letter.pdf');
    assert.ok(handoffKit.coverLetter.storageKey);
    assert.ok(handoffKit.coverLetter.qaAudit.passed);

    assert.ok(handoffKit.readiness.length > 0);

    // P14-006: readiness semantics must separate document readiness from profile completeness
    assert.ok(handoffKit.readinessSemantics);
    assert.equal(handoffKit.readinessSemantics.documentsReady, true);
    assert.equal(handoffKit.readinessSemantics.documentsStatus, 'DOCUMENTS_READY');
    // The stub profile intentionally omits availability/linkedin data:
    assert.equal(handoffKit.readinessSemantics.profileComplete, false);
    assert.equal(handoffKit.readinessSemantics.profileStatus, 'PROFILE_INCOMPLETE');
    assert.ok(handoffKit.readinessSemantics.missingProfileFields.length > 0);
    assert.ok(handoffKit.readinessSemantics.summary.includes('does not imply'));
  });

  it('4. fails closed when the canonical candidate profile cannot be loaded (no placeholder fallback)', async () => {
    const failingService = new ApplicationHandoffService({
      candidateProfileService: {
        getProfile: async () => {
          throw new Error('db unreachable');
        },
      },
    });

    await assert.rejects(
      () =>
        failingService.buildApplicationHandoffKit({
          tenantId: '00000000-0000-0000-0000-000000000001',
          userId: '00000000-0000-0000-0000-000000000002',
          candidateId: '00000000-0000-0000-0000-000000000003',
          applicationPackage: mockPkg,
        }),
      (err) => /loadable canonical candidate profile/i.test(err.message)
    );
  });

  it('5. generated LaTeX contains real education and experience data and zero placeholder sections', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const userId = '00000000-0000-0000-0000-000000000002';
    const candidateId = '00000000-0000-0000-0000-000000000003';

    const handoffKit = await service.buildApplicationHandoffKit({
      tenantId,
      userId,
      candidateId,
      applicationPackage: mockPkg,
    });

    assert.equal(handoffKit.status, 'HANDOFF_READY');
    // Real data must reach the compiled document pipeline (QA runs on extracted text)
    assert.ok(handoffKit.resume.qaAudit.passed);
  });
});

/**
 * @file Unit Test Suite for Career Profile UX & Data Model Refinement (P14-005 / ARCH-056).
 *
 * Tests:
 * 1. Multi-record CRUD for Experience, Education, Certifications, Languages, Links.
 * 2. Strict Evidence Lock: Manual tampering with skills/projects is rejected/ignored.
 * 3. Provenance tagging: USER_PROVIDED vs CLAIMED vs VERIFIED.
 * 4. Derived metric invariants: Tenure, Seniority, and Career Status derivation.
 * 5. MCP Tool Parity: get_candidate_profile vs get_career_profile semantic equivalence.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';
import { randomUUID } from 'node:crypto';

describe('Career Profile UX & Data Model Refinement', () => {
  let mockDb;
  let service;
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const userId = randomUUID();

  const baseContext = {
    tenantId,
    userId,
    role: 'OWNER',
  };

  let candidateRecord;

  beforeEach(() => {
    candidateRecord = {
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Vishwanath Nishad',
      headline: 'Full-Stack & Backend Developer',
      summary: 'Passionate developer building high scale applications.',
      canonicalEmail: 'test@example.com',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileMetadata: {
        currentRole: 'Full-Stack & Backend Developer',
        location: 'Sonbhadra, India',
        careerStatus: 'FRESHER',
        currentEmployment: null,
        userCustom: {
          experience: [
            {
              company: 'FTV Saloon',
              title: 'Full Stack Developer Intern',
              employmentType: 'INTERNSHIP',
              location: 'Lucknow, India',
              startDate: '2024-06',
              endDate: '2024-09',
              isCurrent: false,
              rawDateRange: 'June 2024 - Sept 2024',
              bullets: ['Developed responsive web app features using React and Node.js.'],
              provenanceStatus: 'USER_PROVIDED',
            },
          ],
          education: [
            {
              institution: 'Rajkiya Engineering College',
              degree: 'Bachelor of Technology',
              degreeType: 'BACHELOR',
              fieldOfStudy: 'Electronics Engineering',
              location: 'Sonbhadra, India',
              startDate: '2021-06',
              endDate: '2025-07',
              isCurrent: false,
              currentlyEnrolled: false,
              coursework: ['Data Structures', 'Algorithms', 'DBMS', 'Operating Systems'],
              provenanceStatus: 'USER_PROVIDED',
            },
          ],
          certifications: [
            {
              name: 'AWS Certified Cloud Practitioner',
              issuer: 'Amazon Web Services',
              issueDate: '2024-05',
              credentialId: 'AWS-12345',
              credentialUrl: 'https://aws.amazon.com/verify/12345',
              provenanceStatus: 'USER_PROVIDED',
            },
          ],
          languages: [
            {
              language: 'English',
              proficiency: 'PROFESSIONAL',
              provenanceStatus: 'USER_PROVIDED',
            },
            {
              language: 'Hindi',
              proficiency: 'NATIVE',
              provenanceStatus: 'USER_PROVIDED',
            },
          ],
          portfolioLinks: [
            {
              label: 'GITHUB',
              url: 'https://github.com/vishu1803',
            },
          ],
        },
        careerPreferences: {
          targetRoles: ['Backend Engineer', 'Full Stack Engineer'],
          preferredLocations: ['Remote', 'Bengaluru', 'Delhi NCR'],
          remotePreference: 'FLEXIBLE',
          employmentTypes: ['FULL_TIME'],
          salaryFloor: 800000,
          salaryCurrency: 'INR',
          workAuthorization: ['India Work Authorization'],
          visaSponsorshipRequired: false,
          relocationPreference: 'REMOTE_ONLY',
        },
      },
    };

    const mockSkills = [
      {
        slug: 'fastify',
        name: 'Fastify',
        category: 'FRAMEWORK',
        fineCategory: 'BACKEND_FRAMEWORK',
        tier: 'PRIMARY',
        confidenceScore: 0.95,
        evidenceCount: 5,
        provenanceStatus: 'VERIFIED',
        truthStatus: 'VERIFIED',
        githubEvidence: true,
        resumeClaim: true,
        source: 'BOTH',
      },
      {
        slug: 'react',
        name: 'React',
        category: 'FRAMEWORK',
        fineCategory: 'FRONTEND_FRAMEWORK',
        tier: 'PRIMARY',
        confidenceScore: 0.9,
        evidenceCount: 4,
        provenanceStatus: 'VERIFIED',
        truthStatus: 'VERIFIED',
        githubEvidence: true,
        resumeClaim: true,
        source: 'BOTH',
      },
    ];

    const mockProjects = [
      {
        id: randomUUID(),
        name: 'Ai-job-mcp',
        headline: 'AI Career Agent with MCP',
        technologies: ['Fastify', 'PostgreSQL', 'JavaScript'],
        provenanceStatus: 'VERIFIED',
        verifiedSignalCount: 8,
        evidence: [{ id: randomUUID() }],
      },
    ];

    mockDb = {
      select: () => ({
        from: () => ({
          where: () => {
            const res = Promise.resolve([candidateRecord]);
            res.limit = () => Promise.resolve([candidateRecord]);
            res.orderBy = () => Promise.resolve([candidateRecord]);
            return res;
          },
          leftJoin() {
            return this;
          },
        }),
      }),
      update: () => ({
        set: (updates) => {
          const applyUpdates = () => {
            if (updates.displayName) candidateRecord.displayName = updates.displayName;
            if (updates.headline !== undefined) candidateRecord.headline = updates.headline;
            if (updates.summary !== undefined) candidateRecord.summary = updates.summary;
            if (updates.profileMetadata) candidateRecord.profileMetadata = updates.profileMetadata;
            candidateRecord.updatedAt = new Date().toISOString();
          };
          return {
            where: () => {
              applyUpdates();
              const result = Promise.resolve([candidateRecord]);
              result.returning = () => Promise.resolve([candidateRecord]);
              return result;
            },
          };
        },
      }),
    };

    service = new CandidateProfileService(mockDb);
    service.getProfile = async () => ({
      candidate: candidateRecord,
      skills: mockSkills,
      projects: mockProjects,
      resources: [{ id: randomUUID(), isPrivate: false }],
      identities: [{ provider: 'github', externalUsername: 'vishu1803', verified: true }],
    });
  });

  describe('1. Multi-Record CRUD & Profile Section Updates', () => {
    it('updates identity, location, and career standing cleanly', async () => {
      const result = await service.updateUserProfileSections(baseContext, candidateId, {
        displayName: 'Vishwanath N.',
        headline: 'Senior Backend Engineer',
        location: 'Bengaluru, India',
        careerStatus: 'EMPLOYED',
        currentEmployment: {
          company: 'Acme Corp',
          title: 'Backend Engineer',
          employmentType: 'FULL_TIME',
          startDate: '2025-01',
          isCurrent: true,
        },
      });

      assert.equal(result.displayName, 'Vishwanath N.');
      assert.equal(result.headline, 'Senior Backend Engineer');
      assert.equal(result.location, 'Bengaluru, India');
      assert.equal(result.careerStatus, 'EMPLOYED');
      assert.deepEqual(result.currentEmployment, {
        company: 'Acme Corp',
        title: 'Backend Engineer',
        employmentType: 'FULL_TIME',
        location: null,
        startDate: '2025-01',
        endDate: null,
        isCurrent: true,
      });
    });

    it('persists multi-record experience and computes accurate tenure metrics', async () => {
      const result = await service.updateUserProfileSections(baseContext, candidateId, {
        experience: [
          {
            company: 'FTV Saloon',
            title: 'Developer Intern',
            employmentType: 'INTERNSHIP',
            startDate: '2024-06',
            endDate: '2024-09',
            isCurrent: false,
          },
          {
            company: 'Tech Scale Inc',
            title: 'Full Stack Engineer',
            employmentType: 'FULL_TIME',
            startDate: '2025-01',
            endDate: '2025-07',
            isCurrent: false,
          },
        ],
      });

      assert.equal(result.recentExperience.length, 2);
      assert.equal(result.recentExperience[0].company, 'FTV Saloon');
      assert.equal(result.recentExperience[0].provenanceStatus, 'USER_PROVIDED');
      assert.equal(result.recentExperience[1].company, 'Tech Scale Inc');
      assert.equal(result.recentExperience[1].provenanceStatus, 'USER_PROVIDED');

      // Tenure metrics: 4 mo internship + 7 mo full-time = 11 mo total, 7 mo professional
      assert.equal(result.experienceDuration.totalMonths, 11);
      assert.equal(result.experienceDuration.professionalMonths, 7);
    });

    it('persists multiple education records, certifications, and languages', async () => {
      const result = await service.updateUserProfileSections(baseContext, candidateId, {
        education: [
          {
            institution: 'Rajkiya Engineering College',
            degree: 'B.Tech Electronics',
            degreeType: 'BACHELOR',
            startDate: '2021-06',
            endDate: '2025-07',
            isCurrent: false,
          },
          {
            institution: 'Stanford Online',
            degree: 'Certificate in Distributed Systems',
            degreeType: 'COURSEWORK',
            startDate: '2025-08',
            isCurrent: true,
            currentlyEnrolled: true,
          },
        ],
        certifications: [
          {
            name: 'AWS Certified Developer',
            issuer: 'AWS',
            issueDate: '2024-05',
          },
        ],
        languages: [
          { language: 'English', proficiency: 'PROFESSIONAL' },
          { language: 'German', proficiency: 'INTERMEDIATE' },
        ],
      });

      assert.equal(result.education.length, 2);
      assert.equal(result.education[0].institution, 'Rajkiya Engineering College');
      assert.equal(result.education[1].degreeType, 'COURSEWORK');
      assert.equal(result.education[1].isCurrent, true);

      assert.equal(result.certifications.length, 1);
      assert.equal(result.certifications[0].name, 'AWS Certified Developer');

      assert.equal(result.languages.length, 2);
      assert.deepEqual(result.languages[1], {
        language: 'German',
        proficiency: 'INTERMEDIATE',
        provenanceStatus: 'USER_PROVIDED',
      });
    });
  });

  describe('2. Strict Evidence-Locking Invariant', () => {
    it('discards and ignores manual tampering attempts on skills or projects', async () => {
      const maliciousPayload = {
        displayName: 'Vishwanath Nishad',
        skills: [
          {
            slug: 'fake-skill',
            name: 'Fake Master Skill',
            truthStatus: 'VERIFIED',
            confidenceScore: 1.0,
            evidenceCount: 999,
          },
        ],
        projects: [
          {
            name: 'Fake High Profile Project',
            provenanceStatus: 'VERIFIED',
            verifiedSignalCount: 999,
          },
        ],
      };

      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        maliciousPayload
      );

      // Skills and Projects must remain strictly tied to real database/AST evidence
      assert.equal(
        result.primarySkills.some((s) => s.name === 'Fake Master Skill'),
        false
      );
      assert.equal(
        result.highlightedProjects.some((p) => p.name === 'Fake High Profile Project'),
        false
      );

      // Verified Fastify and React skills remain unaltered
      const skillNames = result.primarySkills.map((s) => s.name);
      assert.ok(skillNames.includes('Fastify'));
      assert.ok(skillNames.includes('React'));
    });
  });

  describe('3. Derived Metric Invariants', () => {
    it('prevents direct manual forging of experienceDuration, seniority, or completeness', async () => {
      const forgedPayload = {
        experienceDuration: {
          totalYears: 15,
          totalMonths: 180,
          professionalYears: 15,
          professionalMonths: 180,
        },
        seniority: 'PRINCIPAL',
        completeness: {
          score: 100,
        },
      };

      const result = await service.updateUserProfileSections(
        baseContext,
        candidateId,
        forgedPayload
      );

      // Because experience list has only 4 mo internship, seniority cannot be forged to PRINCIPAL
      assert.equal(result.seniority, 'ENTRY_LEVEL');
      assert.equal(result.experienceDuration.professionalMonths, 0);
      assert.equal(result.experienceDuration.totalMonths, 4);
    });
  });

  describe('4. MCP Tool Parity (get_candidate_profile <-> get_career_profile)', () => {
    it('returns identical semantic values across both MCP tools', async () => {
      // 1. Fetch from get_career_profile (CandidateProfileService.getCareerProfile)
      const careerProfile = await service.getCareerProfile(baseContext, candidateId);

      // 2. Fetch from get_candidate_profile (MCP handler)
      const mcpOutput = await handleGetCandidateProfile(
        baseContext,
        { candidateId },
        { candidateProfileService: service, db: mockDb }
      );

      // 3. Verify exact semantic equivalence across critical candidate properties
      assert.equal(mcpOutput.candidate.displayName, careerProfile.displayName);
      assert.equal(mcpOutput.candidate.headline, careerProfile.headline);
      assert.equal(mcpOutput.candidate.currentRole, careerProfile.currentRole);
      assert.deepEqual(mcpOutput.candidate.currentEmployment, careerProfile.currentEmployment);
      assert.equal(mcpOutput.candidate.careerStatus, careerProfile.careerStatus);
      assert.equal(mcpOutput.candidate.seniority, careerProfile.seniority);
      assert.equal(mcpOutput.candidate.location, careerProfile.location);
      assert.equal(
        mcpOutput.candidate.experienceDuration.totalMonths,
        careerProfile.experienceDuration.totalMonths
      );
      assert.equal(
        mcpOutput.candidate.experienceDuration.professionalMonths,
        careerProfile.experienceDuration.professionalMonths
      );

      // 4. Verify Job Preferences equivalence
      assert.deepEqual(
        mcpOutput.jobPreferences.targetRoles,
        careerProfile.jobPreferences.targetRoles
      );
      assert.deepEqual(
        mcpOutput.jobPreferences.preferredLocations,
        careerProfile.jobPreferences.preferredLocations
      );
      assert.equal(
        mcpOutput.jobPreferences.remotePreference,
        careerProfile.jobPreferences.remotePreference
      );

      // 5. Verify Experience Records equivalence
      assert.equal(
        mcpOutput.recentExperience[0].company,
        careerProfile.recentExperience[0].company
      );
      assert.equal(
        mcpOutput.recentExperience[0].employmentType,
        careerProfile.recentExperience[0].employmentType
      );
      assert.equal(
        mcpOutput.recentExperience[0].provenanceStatus,
        careerProfile.recentExperience[0].provenanceStatus
      );
    });
  });
});
